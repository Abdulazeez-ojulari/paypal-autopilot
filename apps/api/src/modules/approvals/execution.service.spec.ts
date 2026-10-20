
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ExecutionService } from './execution.service';

jest.mock('../paypal/paypal.client', () => ({
  PaypalClient: jest.fn(),
}))

describe('ExecutionService', () => {
    let service: ExecutionService;
    let prisma: any;
    let paypalInvoicing: any;

    const businessId = 'business-1';
    const userId = 'user-1';
    const approvalId = 'approval-1';
    const invoiceId = 'invoice-1';
    const paypalInvoiceId = 'paypal-invoice-1';

    const decision = {
        invoiceId,
        decision: 'REVIEW_AND_SEND_PAYMENT_REQUEST',
        requiresApproval: true,
        policyStatus: 'REQUIRES_HUMAN_APPROVAL',
        run: { businessId },
    };

    const approval = (overrides: Record<string, any> = {}) => ({
        id: approvalId,
        businessId,
        status: 'APPROVED',
        executionStatus: 'NOT_STARTED',
        executionAttemptKey: null,
        paypalInvoiceId: null,
        executedAt: null,
        decision,
        ...overrides,
    });

    const localInvoice = (includeCustomer = false) => ({
        id: invoiceId,
        invoiceNumber: 'INV-001',
        amount: '100.00',
        currencyCode: 'USD',
        dueAt: new Date('2026-09-01T00:00:00.000Z'),
        status: 'OVERDUE',
        paidAt: null,
        ...(includeCustomer
            ? {
                customer: {
                    name: 'Test Customer',
                    email: 'customer@example.com',
                },
                }
            : {}
        ),
    });

    beforeEach(() => {
        prisma = {
            businessMembership: {
                findUnique: jest.fn().mockResolvedValue({ role: 'OWNER' }),
            },
            humanApproval: {
                findFirst: jest.fn(),
                updateMany: jest.fn(),
                update: jest.fn().mockResolvedValue({}),
            },
            invoice: {
                findFirst: jest.fn(),
            },
        };

        paypalInvoicing = {
            createDraftInvoice: jest.fn().mockResolvedValue({
                id: paypalInvoiceId,
                status: 'DRAFT',
            }),
            sendInvoice: jest.fn().mockResolvedValue({
                statusCode: 200,
                accepted: true,
            }),
            getInvoice: jest.fn()
        };

        service = new ExecutionService(prisma, paypalInvoicing);
    });

    function arrangeExecution() {
        const initialApproval = approval();

        prisma.humanApproval.findFirst
            .mockResolvedValueOnce(initialApproval)
            .mockImplementationOnce(async () => {
                const claimCall = prisma.humanApproval.updateMany.mock.calls[0];
                const attemptKey = claimCall[0].data.executionAttemptKey;

                return approval({
                executionStatus: 'IN_PROGRESS',
                executionAttemptKey: attemptKey,
                });
            });

        prisma.invoice.findFirst
            .mockResolvedValueOnce(localInvoice())
            .mockResolvedValueOnce(localInvoice(true));

        prisma.humanApproval.updateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 1 });
    }

    it('rejects execution when approval has not been approved', async () => {
        prisma.humanApproval.findFirst.mockResolvedValue(
            approval({ status: 'PENDING' })
        );

        await expect(
            service.checkEligibility(userId, businessId, approvalId),
        ).rejects.toThrow(BadRequestException);

        expect(paypalInvoicing.createDraftInvoice).not.toHaveBeenCalled();
        expect(paypalInvoicing.sendInvoice).not.toHaveBeenCalled();
    });

    it('executes an approved payment request and persists success', async () => {
        arrangeExecution();

        const result = await service.executeApproved(userId, businessId, approvalId);

        expect(paypalInvoicing.createDraftInvoice).toHaveBeenCalledWith(
            expect.objectContaining({
                localInvoiceId: invoiceId,
                invoiceNumber: 'INV-001',
                amount: '100.00',
                currencyCode: 'USD',
                customerEmail: 'customer@example.com',
            }),
        );

        expect(paypalInvoicing.sendInvoice).toHaveBeenCalledWith(
            paypalInvoiceId,
            expect.any(String)
        );

        expect(prisma.humanApproval.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: approvalId },
                data: expect.objectContaining({
                    paypalInvoiceId,
                }),
            })
        );

        expect(prisma.humanApproval.updateMany).toHaveBeenLastCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    id: approvalId,
                    businessId,
                    executionStatus: 'IN_PROGRESS',
                }),
                data: expect.objectContaining({
                    executionStatus: 'SUCCEEDED',
                    executedAt: expect.any(Date),
                }),
            }),
        );

        expect(result).toEqual({
            approvalId,
            status: 'APPROVED',
            executionStatus: 'SUCCEEDED',
            paypalInvoiceId,
            message: 'PayPal accepted the invoice send request.',
        });
    });

    it('does not call PayPal when the atomic execution claim fails', async () => {
        arrangeExecution();

        // The atomic claim is contested by another request.
        prisma.humanApproval.updateMany.mockReset();
        prisma.humanApproval.updateMany.mockResolvedValue({ count: 0 });

        await expect(
            service.executeApproved(userId, businessId, approvalId),
        ).rejects.toThrow(ConflictException);

        expect(paypalInvoicing.createDraftInvoice).not.toHaveBeenCalled();
        expect(paypalInvoicing.sendInvoice).not.toHaveBeenCalled();
    });

    it('marks execution FAILED and requires reconciliation when sending fails', async () => {
        arrangeExecution();

        paypalInvoicing.sendInvoice.mockRejectedValue(new Error('PayPal request timed out'));

        await expect(
            service.executeApproved(userId, businessId, approvalId),
        ).rejects.toThrow(ConflictException);

        expect(prisma.humanApproval.updateMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
            where: expect.objectContaining({
                id: approvalId,
                businessId,
                executionStatus: 'IN_PROGRESS',
            }),
            data: expect.objectContaining({
                executionStatus: 'FAILED',
                executionResult: expect.objectContaining({
                    stage: 'SEND_PAYPAL_INVOICE',
                    error: 'PayPal request timed out',
                    reconciliationRequired: true,
                }),
            }),
        }),
        );
    });

    it('rejects execution for a user without owner or admin access', async () => {
        prisma.businessMembership.findUnique.mockResolvedValue({
            role: 'MEMBER'
        });

        await expect(
            service.checkEligibility(userId, businessId, approvalId),
        ).rejects.toThrow('Owner or administrator access required.');

        expect(prisma.humanApproval.findFirst).not.toHaveBeenCalled();
        expect(paypalInvoicing.createDraftInvoice).not.toHaveBeenCalled();
    });
});
