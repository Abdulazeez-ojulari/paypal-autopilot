
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { randomUUID } from 'crypto';
import { PaypalInvoicingService } from './paypal-invoicing.service';

@Injectable()
export class ExecutionService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly paypalInvoicing: PaypalInvoicingService
    ) {}

    private async ensureApprover(userId: string, businessId: string) {
        const membership = await this.prisma.businessMembership.findUnique({
            where: { userId_businessId: { userId, businessId } },
            select: { role: true },
        });

        if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
            throw new ForbiddenException('Owner or administrator access required.');
        }
    }

    async checkEligibility(
        userId: string,
        businessId: string,
        approvalId: string,
    ) {
        await this.ensureApprover(userId, businessId);

        const approval = await this.prisma.humanApproval.findFirst({
            where: { id: approvalId, businessId },
            include: {
                decision: {
                    include: {
                        run: {
                            select: { businessId: true },
                        },
                    },
                },
            }
        });

        if (!approval) {
            throw new NotFoundException('Approval request not found.');
        }

        if (approval.status !== 'APPROVED') {
            throw new BadRequestException('The approval must be approved before execution can be considered.');
        }

        if (approval.executionStatus !== 'NOT_STARTED') {
            throw new BadRequestException(`Execution is not available from state ${approval.executionStatus}.`);
        }

        if (approval.decision.run.businessId !== businessId) {
            throw new ForbiddenException('The AI decision does not belong to this business.');
        }

        if (
        !approval.decision.requiresApproval || approval.decision.policyStatus !== 'REQUIRES_HUMAN_APPROVAL'
        ) {
            throw new BadRequestException('The decision does not satisfy the expected approval policy.');
        }

        const invoice = await this.prisma.invoice.findFirst({
            where: {
                id: approval.decision.invoiceId,
                businessId,
            },
            select: {
                id: true,
                status: true,
                amount: true,
                paidAmount: true,
                currencyCode: true,
                dueAt: true,
                paidAt: true,
                invoiceNumber: true,
            },
        });

        if (!invoice) {
            throw new NotFoundException('The invoice does not exist in this business.');
        }

        if (invoice.status !== 'OVERDUE' || invoice.paidAt !== null) {
            throw new BadRequestException('The invoice is no longer eligible for overdue-invoice recovery.');
        }

        const outstandingAmount = Number(
            (Number(invoice.amount) - Number(invoice.paidAmount ?? 0)).toFixed(2)
        );

        if (!Number.isFinite(outstandingAmount) || outstandingAmount <= 0) {
            throw new BadRequestException('The invoice has no outstanding balance to recover.');
        }

        const supportedActions = [
            'REVIEW_AND_SEND_PAYMENT_REQUEST',
        ];

        if (!supportedActions.includes(approval.decision.decision)) {
            throw new BadRequestException(`Unsupported recovery action: ${approval.decision.decision}`);
        }

        return {
            approvalId: approval.id,
            approvalStatus: approval.status,
            executionStatus: approval.executionStatus,
            businessId,
            invoice: {
                id: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
                amount: invoice.amount.toString(),
                paidAmount: invoice.paidAmount,
                currencyCode: invoice.currencyCode,
                dueAt: invoice.dueAt,
                status: invoice.status,
            },
            standingAmount: outstandingAmount.toFixed(2),
            action: approval.decision.decision,
            eligibleForExecution: true,
            executed: false,
            nextStep: 'An action-specific executor and idempotency protection are still required.',
        };
    }

    async executeApproved(
        userId: string,
        businessId: string,
        approvalId: string,
    ) {
        await this.checkEligibility(userId, businessId, approvalId);

        const attemptKey = randomUUID();

        const claim = await this.prisma.humanApproval.updateMany({
            where: {
                id: approvalId,
                businessId,
                status: 'APPROVED',
                executionStatus: 'NOT_STARTED',
            },
            data: {
                executionStatus: 'IN_PROGRESS',
                executionAttemptKey: attemptKey,
            },
        });

        if (claim.count !== 1) {
            throw new ConflictException('This action has already been claimed or its state has changed.');
        }

        let stage = 'LOAD_AND_REVALIDATE';

        try {
            const approval = await this.prisma.humanApproval.findFirst({
                where: { id: approvalId, businessId },
                include: {
                    decision: {
                        include: { run: { select: { businessId: true } } },
                    },
                },
            });

            if (!approval || approval.status !== 'APPROVED') {
                throw new Error('Approval changed after the execution claim.');
            }

            if (
                approval.executionAttemptKey !== attemptKey ||
                approval.executionStatus !== 'IN_PROGRESS' ||
                approval.decision.run.businessId !== businessId ||
                approval.decision.decision !== 'REVIEW_AND_SEND_PAYMENT_REQUEST' ||
                !approval.decision.requiresApproval ||
                approval.decision.policyStatus !== 'REQUIRES_HUMAN_APPROVAL'
            ) {
                throw new Error('Execution state or policy validation failed.');
            }

            const invoice = await this.prisma.invoice.findFirst({
                where: {
                    id: approval.decision.invoiceId,
                    businessId,
                },
                include: {
                    customer: { select: { name: true, email: true } },
                },
            });

            if (
                !invoice || invoice.status !== 'OVERDUE' || invoice.paidAt !== null
            ) {
                throw new Error('Invoice is no longer eligible for recovery.');
            }

            if (!invoice.customer.email?.trim()) {
                throw new Error('Customer email is missing.');
            }

            if (Number(invoice.amount) <= 0) {
                throw new Error('Invoice amount must be positive.');
            }

            const outstandingAmount = Number((Number(invoice.amount) - Number(invoice.paidAmount ?? 0)).toFixed(2));

            if (!Number.isFinite(outstandingAmount) || outstandingAmount <= 0) {
                throw new Error('The invoice has no outstanding balance to recover.');
            }

            let paypalInvoiceId = approval.paypalInvoiceId;
            let stageResult: any;

            if (!paypalInvoiceId) {
                stage = 'CREATE_PAYPAL_DRAFT';

                const draft = await this.paypalInvoicing.createDraftInvoice({
                    attemptKey,
                    localInvoiceId: invoice.id,
                    invoiceNumber: invoice.invoiceNumber,
                    amount: outstandingAmount.toFixed(2),
                    currencyCode: invoice.currencyCode,
                    customerName: invoice.customer.name,
                    customerEmail: invoice.customer.email,
                });

                paypalInvoiceId = draft.id;

                await this.prisma.humanApproval.update({
                    where: { id: approvalId },
                    data: {
                        paypalInvoiceId,
                        executionResult: {
                            stage: 'DRAFT_CREATED',
                            paypalInvoiceId,
                            paypalStatus: draft.status ?? 'DRAFT',
                        },
                    },
                });
            }

            stage = 'SEND_PAYPAL_INVOICE';

            const sent = await this.paypalInvoicing.sendInvoice(paypalInvoiceId, attemptKey);

            stageResult = {
                stage: 'INVOICE_SEND_ACCEPTED',
                paypalInvoiceId,
                httpStatus: sent.statusCode,
                accepted: sent.accepted,
                localInvoiceId: invoice.id,
                invoiceNumber: invoice.invoiceNumber,
            };

            const updated = await this.prisma.humanApproval.updateMany({
                where: {
                    id: approvalId,
                    businessId,
                    executionStatus: 'IN_PROGRESS',
                    executionAttemptKey: attemptKey,
                },
                data: {
                    executionStatus: 'SUCCEEDED',
                    executionResult: stageResult,
                    executedAt: new Date(),
                },
            });

            if (updated.count !== 1) {
                throw new Error('External request was accepted, but the final state could not be recorded. Reconcile before retrying.');
            }

            return {
                approvalId,
                status: 'APPROVED',
                executionStatus: 'SUCCEEDED',
                paypalInvoiceId,
                message: 'PayPal accepted the invoice send request.',
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown execution failure';

            await this.prisma.humanApproval.updateMany({
                where: {
                    id: approvalId,
                    businessId,
                    executionStatus: 'IN_PROGRESS',
                    executionAttemptKey: attemptKey,
                },
                data: {
                    executionStatus: 'FAILED',
                    executionResult: {
                        stage,
                        error: message.slice(0, 1000),
                        reconciliationRequired: true,
                    },
                },
            });

            throw new ConflictException('Execution failed or its outcome is uncertain. Inspect the approval record and reconcile with PayPal before attempting another action.');
        }
    }

    
    async reconcile(
        userId: string,
        businessId: string,
        approvalId: string,
    ) {
        await this.ensureApprover(userId, businessId);

        const approval = await this.prisma.humanApproval.findFirst({
            where: { id: approvalId, businessId },
            include: {
                decision: {
                    include: { run: { select: { businessId: true } } },
                },
            },
        });

        if (!approval) {
            throw new NotFoundException('Approval request not found.');
        }

        if (
            approval.status !== 'APPROVED' ||
            approval.decision.run.businessId !== businessId ||
            approval.decision.decision !== 'REVIEW_AND_SEND_PAYMENT_REQUEST'
        ) {
            throw new BadRequestException('This approval is not eligible for PayPal invoice reconciliation.');
        }

        if (!approval.paypalInvoiceId) {
            throw new ConflictException('No PayPal invoice ID is saved. The draft-creation outcome is unknown; investigate PayPal before creating another invoice.');
        }

        if (!['IN_PROGRESS', 'FAILED', 'SUCCEEDED'].includes(approval.executionStatus)) {
            throw new ConflictException(`Cannot reconcile execution in state ${approval.executionStatus}.`);
        }

        const invoice = await this.prisma.invoice.findFirst({
            where: {
                id: approval.decision.invoiceId,
                businessId,
            },
            include: {
                customer: { select: { email: true } },
            },
        });

        if (!invoice) {
            throw new NotFoundException('Local invoice not found.');
        }

        let external: Awaited<ReturnType<PaypalInvoicingService['getInvoice']>>;

        try {
            external = await this.paypalInvoicing.getInvoice(approval.paypalInvoiceId);
        } catch {
            throw new ConflictException('Could not verify the PayPal invoice. Execution state is unchanged; retry reconciliation later.');
        }

        const externalEmail = external.primary_recipients?.[0]?.billing_info?.email_address?.trim().toLowerCase();
        const expectedEmail = invoice.customer.email?.trim().toLowerCase();

        if (
            external.id !== approval.paypalInvoiceId ||
            external.detail?.reference !== invoice.id ||
            external.detail?.currency_code !== invoice.currencyCode ||
            !expectedEmail ||
            externalEmail !== expectedEmail
        ) {
            throw new ConflictException('PayPal invoice details do not match the local invoice. No automatic recovery was performed.');
        }

        const status = external.status.toUpperCase();
        const sentOrFurther = [
            'SENT',
            'UNPAID',
            'PARTIALLY_PAID',
            'PAID',
            'MARKED_AS_PAID',
        ].includes(status);

        if (sentOrFurther) {
            const result = await this.prisma.humanApproval.updateMany({
                where: {
                    id: approvalId,
                    businessId,
                    paypalInvoiceId: external.id,
                    executionStatus: {
                        in: ['IN_PROGRESS', 'FAILED', 'SUCCEEDED'],
                    },
                },
                data: {
                    executionStatus: 'SUCCEEDED',
                    executionResult: {
                        stage: 'RECONCILED_WITH_PAYPAL',
                        paypalInvoiceId: external.id,
                        paypalStatus: status,
                        reconciledAt: new Date().toISOString(),
                        note: 'PayPal confirms the invoice progressed beyond draft status.',
                    },
                    executedAt: approval.executedAt ?? new Date(),
                },
            });

            if (result.count !== 1) {
                throw new ConflictException('Execution state changed during reconciliation. Fetch the approval and reconcile again.');
            }

            return {
                approvalId,
                executionStatus: 'SUCCEEDED',
                paypalInvoiceId: external.id,
                paypalStatus: status,
                reconciled: true,
                note: 'PayPal confirms the invoice is no longer a draft. This does not itself update the local invoice payment status.',
            };
        }

        const result = {
            stage: 'RECONCILIATION_REQUIRES_REVIEW',
            paypalInvoiceId: external.id,
            paypalStatus: status,
            reconciledAt: new Date().toISOString(),
            note:
            status === 'DRAFT'
                ? 'PayPal still reports a draft. A separately controlled send retry may be appropriate after reviewing the execution attempt.'
                : 'The PayPal invoice state does not confirm successful sending.',
        };

        await this.prisma.humanApproval.updateMany({
            where: {
                id: approvalId,
                businessId,
                paypalInvoiceId: external.id,
                executionStatus: { in: ['IN_PROGRESS', 'FAILED', 'SUCCEEDED'] },
            },
            data: { executionResult: result },
        });

        return {
            approvalId,
            executionStatus: approval.executionStatus,
            paypalInvoiceId: external.id,
            paypalStatus: status,
            reconciled: true,
            requiresReview: true,
            note: result.note,
        };
    }

}
