
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class ExecutionService {
    constructor(private readonly prisma: PrismaService) {}

    async checkEligibility(
        userId: string,
        businessId: string,
        approvalId: string,
    ) {
        const membership = await this.prisma.businessMembership.findUnique({
            where: {
                userId_businessId: { userId, businessId },
            },
            select: { role: true },
        });

        if (!membership || !['OWNER', 'ADMIN'].includes(membership.role)) {
            throw new ForbiddenException('Only an authorized business owner or administrator can check execution eligibility.');
        }

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

        const supportedActions = [
            'REVIEW_AND_SEND_PAYMENT_REQUEST',
            'SEND_PAYMENT_REMINDER',
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
                currencyCode: invoice.currencyCode,
                dueAt: invoice.dueAt,
                status: invoice.status,
            },
            action: approval.decision.decision,
            eligibleForExecution: true,
            executed: false,
            nextStep: 'An action-specific executor and idempotency protection are still required.',
        };
    }
}
