
import { ConflictException } from '@nestjs/common';
import { ExecutionService } from './execution.service';

jest.mock('../paypal/paypal.client', () => ({
  PaypalClient: jest.fn(),
}))

describe('ExecutionService.reconcile', () => {
    let service: ExecutionService;
    let prisma: any;
    let paypalInvoicing: any;

    const userId = 'user-1';
    const businessId = 'business-1';
    const approvalId = 'approval-1';
    const localInvoiceId = 'local-invoice-1';
    const paypalInvoiceId = 'paypal-invoice-1';

    const approval = (overrides: Record<string, any> = {}) => ({
        id: approvalId,
        businessId,
        status: 'APPROVED',
        executionStatus: 'FAILED',
        paypalInvoiceId,
        executedAt: null,
        executionResult: {
            stage: 'INVOICE_SEND_ACCEPTED',
            requestedAmount: '100.00',
            currencyCode: 'USD',
        },
        decision: {
            invoiceId: localInvoiceId,
            decision: 'REVIEW_AND_SEND_PAYMENT_REQUEST',
            requiresApproval: true,
            policyStatus: 'REQUIRES_HUMAN_APPROVAL',
            run: { businessId },
        },
        ...overrides,
    });

    const localInvoice = () => ({
        id: localInvoiceId,
        amount: '100.00',
        paidAmount: '0.00',
        currencyCode: 'USD',
        customer: { email: 'customer@example.com' },
    });

    const externalInvoice = (overrides: Record<string, any> = {}) => ({
        id: paypalInvoiceId,
        status: 'SENT',
        detail: {
            reference: localInvoiceId,
            currency_code: 'USD',
        },
        amount: {
            currency_code: 'USD',
            value: '100.00',
        },
        payments: {
            paid_amount: {
                currency_code: 'USD',
                value: '0.00',
            },
        },
        primary_recipients: [
            {
                billing_info: {
                    email_address: 'customer@example.com',
                },
            },
        ],
        ...overrides,
    });

    beforeEach(() => {
        prisma = {
            businessMembership: {
                findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
            },
            humanApproval: {
                findFirst: jest.fn().mockResolvedValue(approval()),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            invoice: {
                findFirst: jest.fn().mockResolvedValue(localInvoice()),
            }
        };

        paypalInvoicing = {
            getInvoice: jest.fn().mockResolvedValue(externalInvoice()),
            createDraftInvoice: jest.fn(),
            sendInvoice: jest.fn(),
        };

        service = new ExecutionService(prisma, paypalInvoicing);
    });

    it('marks execution successful when PayPal confirms the invoice was sent', async () => {
        const result = await service.reconcile(userId, businessId, approvalId);

        expect(paypalInvoicing.getInvoice).toHaveBeenCalledWith(paypalInvoiceId);

        expect(prisma.humanApproval.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: approvalId,
                    businessId,
                    paypalInvoiceId,
                    executionStatus: 'FAILED',
                }),
                data: expect.objectContaining({
                    executionStatus: 'SUCCEEDED',
                    executionResult: expect.objectContaining({
                        stage: 'RECONCILED_WITH_PAYPAL',
                        paypalInvoiceId,
                        paypalStatus: 'SENT',
                    }),
                }),
            })
        );

        expect(result).toEqual(
            expect.objectContaining({
                approvalId,
                executionStatus: 'SUCCEEDED',
                paypalInvoiceId,
                paypalStatus: 'SENT',
                reconciled: true,
            })
        );

        expect(paypalInvoicing.createDraftInvoice).not.toHaveBeenCalled();
        expect(paypalInvoicing.sendInvoice).not.toHaveBeenCalled();
    });

    it('requires review when PayPal still reports a draft', async () => {
        paypalInvoicing.getInvoice.mockResolvedValue(externalInvoice({ status: 'DRAFT' }));

        const result = await service.reconcile(userId, businessId, approvalId);

        expect(result).toEqual(
            expect.objectContaining({
                executionStatus: 'FAILED',
                paypalStatus: 'DRAFT',
                reconciled: true,
                requiresReview: true,
            }),
        );

        expect(prisma.humanApproval.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                data: {
                    executionResult: expect.objectContaining({
                        stage: 'RECONCILIATION_REQUIRES_REVIEW',
                        paypalStatus: 'DRAFT',
                    })
                },
            })
        );

        expect(paypalInvoicing.sendInvoice).not.toHaveBeenCalled();
    });

    it('rejects a PayPal invoice whose local reference does not match', async () => {
        paypalInvoicing.getInvoice.mockResolvedValue(
            externalInvoice({
                detail: {
                    reference: 'another-local-invoice',
                    currency_code: 'USD',
                },
            }),
        );

        await expect(
            service.reconcile(userId, businessId, approvalId),
        ).rejects.toThrow(ConflictException);

        expect(prisma.humanApproval.updateMany).not.toHaveBeenCalled();
    });

    it('rejects a PayPal invoice with a different customer email', async () => {
        paypalInvoicing.getInvoice.mockResolvedValue(
            externalInvoice({
                primary_recipients: [
                    {
                        billing_info: {
                            email_address: 'someone-else@example.com',
                        }
                    },
                ],
            })
        );

        await expect(
            service.reconcile(userId, businessId, approvalId),
        ).rejects.toThrow(ConflictException);

        expect(prisma.humanApproval.updateMany).not.toHaveBeenCalled();
    });

    it('leaves execution state unchanged when PayPal cannot be queried', async () => {
        paypalInvoicing.getInvoice.mockRejectedValue(new Error('PayPal unavailable'));

        await expect(
            service.reconcile(userId, businessId, approvalId),
        ).rejects.toThrow(ConflictException);

        expect(prisma.humanApproval.updateMany).not.toHaveBeenCalled();
    });

    it('rejects reconciliation when no PayPal invoice ID was saved', async () => {
        prisma.humanApproval.findFirst.mockResolvedValue(approval({ paypalInvoiceId: null }));

        await expect(
            service.reconcile(userId, businessId, approvalId),
        ).rejects.toThrow(ConflictException);

        expect(paypalInvoicing.getInvoice).not.toHaveBeenCalled();
    });
});
