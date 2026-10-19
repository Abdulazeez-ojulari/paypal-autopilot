
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma.service';
import { PaypalClient } from './paypal.client';
import { PaypalInvoiceSyncService } from './paypal-invoice-sync.service';

jest.mock('./paypal.client', () => ({
  PaypalClient: jest.fn()
}));

describe('PaypalInvoiceSyncService', () => {
    let service: PaypalInvoiceSyncService;
    const prisma = {
        invoice: {
            findUnique: jest.fn(),
            update: jest.fn()
        },
    };

    const paypalClient = { getInvoice: jest.fn() };

    const makeLocalInvoice = (overrides: Record<string, unknown> = {}) => ({
        id: 'local-invoice-1',
        invoiceNumber: 'INV-001',
        amount: '100.00',
        paidAmount: '0.00',
        currencyCode: 'USD',
        status: 'OVERDUE',
        dueAt: new Date('2020-01-01T00:00:00.000Z'),
        paidAt: null,
        ...overrides,
    });

    const makePaypalInvoice = (
        status: string,
        overrides: Record<string, unknown> = {}
    ) => ({
        id: 'PAYPAL-INV-001',
        status,
        detail: {
            reference: 'local-invoice-1',
            currency_code: 'USD',
        },
        payments: undefined,
        ...overrides,
    });

    beforeEach(async () => {
        jest.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                PaypalInvoiceSyncService,
                { provide: PrismaService, useValue: prisma },
                { provide: PaypalClient, useValue: paypalClient }
            ],
        }).compile();

        service = module.get(PaypalInvoiceSyncService);

        prisma.invoice.findUnique.mockResolvedValue(makeLocalInvoice());
        prisma.invoice.update.mockImplementation(
            async ({ data }: { data: Record<string, unknown> }) => ({
                ...makeLocalInvoice(),
                ...data,
            })
        );
    });

    async function runSync(
        paypalInvoice: Record<string, unknown>,
        localInvoice = makeLocalInvoice(),
    ) {
        prisma.invoice.findUnique.mockResolvedValue(localInvoice);
        paypalClient.getInvoice.mockResolvedValue(paypalInvoice);

        return service.sync('PAYPAL-INV-001');
    }

    it.each([
        ['SENT', 'OVERDUE'],
        ['UNPAID', 'OVERDUE'],
        ['SHARED', 'OVERDUE'],
        ['PARTIALLY_PAID', 'PARTIALLY_PAID'],
        ['PAYMENT_PENDING', 'PAYMENT_PENDING'],
        ['PAID', 'PAID'],
        ['MARKED_AS_PAID', 'PAID'],
        ['PAID_EXTERNAL', 'PAID'],
        ['CANCELLED', 'CANCELLED'],
        ['AUTO_CANCELLED', 'CANCELLED'],
        ['PARTIALLY_REFUNDED', 'PARTIALLY_REFUNDED'],
        ['REFUNDED', 'REFUNDED'],
        ['MARKED_AS_REFUNDED', 'REFUNDED'],
        ['REFUNDED_EXTERNAL', 'REFUNDED'],
    ])(
        'maps PayPal status %s to local status %s',
        async (paypalStatus, expectedLocalStatus) => {
            const external = makePaypalInvoice(paypalStatus, {
                payments: paypalStatus === 'PARTIALLY_PAID' 
                ? {
                    paid_amount: {
                        currency_code: 'USD',
                        value: '40.00'
                    },
                } : undefined,
            });

            const result = await runSync(external);

            expect(result.synchronized).toBe(true);
            expect(result.paypalStatus).toBe(paypalStatus);
            expect(result.localStatus).toBe(expectedLocalStatus);

            expect(prisma.invoice.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'local-invoice-1' },
                    data: expect.objectContaining({
                        status: expectedLocalStatus,
                    }),
                }),
            );
        },
    );

    it('marks a not-yet-due SENT invoice as UNPAID', async () => {
        const result = await runSync(
            makePaypalInvoice('SENT'),
            makeLocalInvoice({
                dueAt: new Date('2099-01-01T00:00:00.000Z')
            })
        );

        expect(result.localStatus).toBe('UNPAID');
    });

    it('stores the actual partial payment amount', async () => {
        await runSync(
            makePaypalInvoice('PARTIALLY_PAID', {
                payments: {
                    paid_amount: {
                        currency_code: 'USD',
                        value: '40.00',
                    },
                }
            })
        );

        const updateCall = prisma.invoice.update.mock.calls[0][0];

        expect(updateCall.data.status).toBe('PARTIALLY_PAID');
        expect(updateCall.data.paidAmount.toString()).toBe('40');
    });

    it('sets paidAmount to the full invoice amount when PAID has no paid_amount field', async () => {
        await runSync(makePaypalInvoice('PAID'));

        const updateCall = prisma.invoice.update.mock.calls[0][0];

        expect(updateCall.data.status).toBe('PAID');
        expect(updateCall.data.paidAmount.toString()).toBe('100');
        expect(updateCall.data.paidAt).toBeInstanceOf(Date);
    });

    it('rejects a currency mismatch', async () => {
        await expect(
            runSync(
                makePaypalInvoice('PAID', {
                    detail: {
                        reference: 'local-invoice-1',
                        currency_code: 'EUR',
                    }
                })
            ))
            .rejects.toThrow(/currency mismatch/i);

        expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('does not update the database for an unknown PayPal status', async () => {
        const result = await runSync(makePaypalInvoice('SOME_NEW_STATUS'));

        expect(result.synchronized).toBe(false);
        expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('does not update the database when the PayPal invoice has no local reference', async () => {
        const result = await runSync(
            makePaypalInvoice('PAID', {
                detail: { currency_code: 'USD' }
            })
        );

        expect(result.synchronized).toBe(false);
        expect(prisma.invoice.update).not.toHaveBeenCalled();
    });

    it('does not update the database when the local invoice cannot be found', async () => {
        prisma.invoice.findUnique.mockResolvedValue(null);
        paypalClient.getInvoice.mockResolvedValue(makePaypalInvoice('PAID'));

        const result = await service.sync('PAYPAL-INV-001');

        expect(result.synchronized).toBe(false);
        expect(prisma.invoice.update).not.toHaveBeenCalled();
    });
});
