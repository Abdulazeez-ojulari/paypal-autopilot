
import { BadRequestException } from '@nestjs/common';
import { PaypalWebhookService } from './paypal.webhook.service';
import { PaypalClient } from './paypal.client';
import { PaypalInvoiceSyncService } from './paypal-invoice-sync.service';
import { PrismaService } from '../../prisma.service';

jest.mock('./paypal.client', () => ({
  PaypalClient: jest.fn(),
}));

describe('PaypalWebhookService', () => {
    let service: PaypalWebhookService;
    let prisma: any;
    let paypalClient: any;
    let invoiceSyncService: any;

    const headers = {
        auth_algo: 'SHA256withRSA',
        cert_url: 'https://api.sandbox.paypal.com/cert',
        transmission_id: 'transmission-1',
        transmission_sig: 'signature',
        transmission_time: '2026-10-20T10:00:00Z',
    };

    const event = (overrides: Record<string, any> = {}) => ({
        id: 'event-1',
        event_type: 'INVOICING.INVOICE.PAID',
        resource_type: 'invoice',
        resource: { id: 'paypal-invoice-1' },
        summary: 'Invoice paid',
        ...overrides,
    });

    beforeEach(() => {
        prisma = {
            paypalWebhookEvent: {
                findUnique: jest.fn().mockResolvedValue(null),
                upsert: jest.fn().mockResolvedValue({ id: 'db-event-1' }),
                update: jest.fn().mockResolvedValue({}),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            paypalOrder: {
                findUnique: jest.fn().mockResolvedValue({ status: 'CREATED' }),
                updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            paypalCapture: {
                upsert: jest.fn().mockResolvedValue({}),
            },
            paypalPaymentEvent: {
                create: jest.fn().mockResolvedValue({}),
                upsert: jest.fn().mockResolvedValue({ id: 'payment-event-1' }),
            },
            $transaction: jest.fn(async (callback: (tx: any) => any) =>
                callback({
                    paypalOrder: prisma.paypalOrder,
                    paypalCapture: prisma.paypalCapture,
                    paypalPaymentEvent: prisma.paypalPaymentEvent,
                }),
            ),
        };

        paypalClient = { verifyWebhookSignature: jest.fn().mockResolvedValue(true) };

        invoiceSyncService = {
            sync: jest.fn().mockResolvedValue({
                synchronized: true,
                localStatus: 'PAID',
            })
        };

        service = new PaypalWebhookService(
            prisma as PrismaService,
            paypalClient as PaypalClient,
            invoiceSyncService as PaypalInvoiceSyncService,
        );
    });

    it('rejects malformed events before database writes', async () => {
        await expect(
            service.handleWebhook(headers, { id: '', event_type: '' } as any),
        ).rejects.toThrow(BadRequestException);

        expect(paypalClient.verifyWebhookSignature).not.toHaveBeenCalled();
        expect(prisma.paypalWebhookEvent.upsert).not.toHaveBeenCalled();
    });

    it('rejects an invalid signature before reading or writing webhook events', async () => {
        paypalClient.verifyWebhookSignature.mockResolvedValue(false);

        await expect(
            service.handleWebhook(headers, event()),
        ).rejects.toThrow('Invalid PayPal webhook signature.');

        expect(prisma.paypalWebhookEvent.findUnique).not.toHaveBeenCalled();
        expect(prisma.paypalWebhookEvent.upsert).not.toHaveBeenCalled();
        expect(invoiceSyncService.sync).not.toHaveBeenCalled();
    });

    it('verifies the signature before checking for duplicates', async () => {
        prisma.paypalWebhookEvent.upsert.mockResolvedValue({
            id: 'db-event-1',
            eventId: 'event-1',
            eventType: 'PAYMENT.CAPTURE.COMPLETED',
            resourceType: 'capture',
            resourceId: 'capture-1',
            summary: null,
            processed: true,
            processing: false,
            processedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        const result = await service.handleWebhook(headers, event());

        expect(paypalClient.verifyWebhookSignature).toHaveBeenCalledWith(headers, event());
        expect(prisma.paypalWebhookEvent.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { eventId: 'event-1' },
                create: expect.objectContaining({
                    eventId: 'event-1',
                }),
            }),
        );

        expect(
            paypalClient.verifyWebhookSignature.mock.invocationCallOrder[0],
        ).toBeLessThan(
            prisma.paypalWebhookEvent.upsert.mock.invocationCallOrder[0],
        );
        expect(result).toEqual({
            received: true,
            duplicate: true,
            eventId: 'event-1',
        });
        expect(prisma.paypalWebhookEvent.update).not.toHaveBeenCalled();
        expect(prisma.paypalWebhookEvent.updateMany).not.toHaveBeenCalled();
        expect(invoiceSyncService.sync).not.toHaveBeenCalled();
    });

    it('synchronizes invoice events and marks the webhook processed', async () => {
        const result = await service.handleWebhook(headers, event());

        expect(prisma.paypalWebhookEvent.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { eventId: 'event-1' },
                create: expect.objectContaining({
                    eventId: 'event-1',
                    eventType: 'INVOICING.INVOICE.PAID',
                }),
            }),
        );

        expect(invoiceSyncService.sync).toHaveBeenCalledWith('paypal-invoice-1');

        expect(prisma.paypalWebhookEvent.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    eventId: 'event-1',
                    processed: false,
                    processing: true,
                    processingToken: expect.any(String),
                }),
                data: expect.objectContaining({
                    processed: true,
                    processing: false,
                    processingToken: null,
                    processedAt: expect.any(Date),
                }),
            }),
        );

        expect(result).toEqual({ received: true, duplicate: false, eventId: 'event-1' });
    });

    it('does not mark an event processed when invoice synchronization fails', async () => {
        invoiceSyncService.sync.mockRejectedValue(new Error('PayPal invoice lookup failed'));

        await expect(
            service.handleWebhook(headers, event()),
        ).rejects.toThrow('PayPal invoice lookup failed');

        expect(prisma.paypalWebhookEvent.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    eventId: 'event-1',
                    processed: false,
                    processing: true,
                    processingToken: expect.any(String),
                }),
                data: {
                    processing: false,
                    processingToken: null,
                },
            }),
        );
    });

    it('records a completed capture and its payment event in a transaction', async () => {
        const captureEvent = event({
            event_type: 'PAYMENT.CAPTURE.COMPLETED',
            resource_type: 'capture',
            resource: {
                id: 'capture-1',
                amount: {
                    value: '100.00',
                    currency_code: 'USD',
                },
                supplementary_data: {
                    related_ids: { order_id: 'order-1' },
                },
            },
        });

        await service.handleWebhook(headers, captureEvent);

        expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(prisma.paypalOrder.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { paypalOrderId: 'order-1' },
                data: { status: 'COMPLETED' },
            })
        );

        expect(prisma.paypalCapture.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { paypalCaptureId: 'capture-1' },
                create: expect.objectContaining({
                    paypalCaptureId: 'capture-1',
                    paypalOrderId: 'order-1',
                    status: 'COMPLETED',
                    amount: '100.00',
                    currencyCode: 'USD',
                }),
            }),
        );

        expect(prisma.paypalPaymentEvent.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    idempotencyKey: 'capture:capture-1:COMPLETED',
                },
                create: expect.objectContaining({
                    paypalOrderId: 'order-1',
                    paypalCaptureId: 'capture-1',
                    source: 'PAYPAL_WEBHOOK',
                    eventType: 'PAYMENT.CAPTURE.COMPLETED',
                    newStatus: 'COMPLETED',
                }),
                update: {},
            }),
        );
    });

    it('ignores an invoice event without a resource ID but records it as handled', async () => {
        const noResourceId = event({
            resource: {},
            event_type: 'INVOICING.INVOICE.PAID',
        });

        const result = await service.handleWebhook(headers, noResourceId);

        expect(invoiceSyncService.sync).not.toHaveBeenCalled();
        expect(prisma.paypalWebhookEvent.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    eventId: 'event-1',
                    processed: false,
                    processing: true,
                    processingToken: expect.any(String),
                }),
                data: expect.objectContaining({
                    processed: true,
                    processing: false,
                    processingToken: null,
                    processedAt: expect.any(Date),
                }),
            }),
        );
        expect(result.duplicate).toBe(false);
    });
    
    it('does not synchronize an already-processed duplicate event', async () => {
        prisma.paypalWebhookEvent.upsert.mockResolvedValue({
            id: 'db-event-1',
            eventId: 'event-1',
            processed: true,
            processing: false,
        });

        const result = await service.handleWebhook(headers, event());

        expect(result).toEqual({
            received: true,
            duplicate: true,
            eventId: 'event-1',
        });
        expect(invoiceSyncService.sync).not.toHaveBeenCalled();
        expect(prisma.paypalWebhookEvent.update).not.toHaveBeenCalled();
        expect(prisma.paypalWebhookEvent.updateMany).not.toHaveBeenCalled();
    });

    
    it('does not process the same event concurrently when another request owns the claim', async () => {
        
        let releaseSync!: () => void;

        const syncGate = new Promise<void>((resolve) => {
            releaseSync = resolve;
        });

        let claimTaken = false;

        prisma.paypalWebhookEvent.updateMany.mockImplementation(
            async (args: any) => {
                // The active owner is allowed to complete its event.
                if (
                    args.data?.processed === true &&
                    typeof args.where?.processingToken === 'string'
                ) {
                    return { count: 1 };
                }

                // Only the owner can release a failed claim.
                if (
                    args.data?.processing === false &&
                    typeof args.where?.processingToken === 'string'
                ) {
                    return { count: 1 };
                }

                // Only the first request obtains the initial claim.
                if (
                    args.where?.processing === false &&
                    args.data?.processing === true &&
                    !claimTaken
                ) {
                    claimTaken = true;
                    return { count: 1 };
                }

                // The concurrent request cannot claim or recover the event.
                return { count: 0 };
            },
        );

        prisma.paypalWebhookEvent.findUnique.mockResolvedValue({
            id: 'db-event-1',
            eventId: 'event-1',
            processed: false,
            processing: true,
        });

        invoiceSyncService.sync.mockReturnValueOnce(syncGate);

        const firstRequest = service.handleWebhook(headers, event());

        while (invoiceSyncService.sync.mock.calls.length === 0) {
            await new Promise((resolve) => setImmediate(resolve));
        }

        const secondResult = await service.handleWebhook(headers, event());

        expect(secondResult).toEqual({
            received: true,
            duplicate: true,
            processing: true,
            eventId: 'event-1'
        });
        expect(invoiceSyncService.sync).toHaveBeenCalledTimes(1);

        releaseSync();
        await expect(firstRequest).resolves.toEqual({
            received: true,
            duplicate: false,
            eventId: 'event-1',
        });
    });


    it('releases a failed claim and allows a subsequent delivery to retry', async () => {
        invoiceSyncService.sync
            .mockRejectedValueOnce(new Error('Temporary PayPal API failure'))
            .mockResolvedValueOnce({ synchronized: true, localStatus: 'PAID' });

        await expect(
            service.handleWebhook(headers, event()),
        ).rejects.toThrow('Temporary PayPal API failure');

        expect(prisma.paypalWebhookEvent.updateMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    eventId: 'event-1',
                    processed: false,
                    processing: true,
                    processingToken: expect.any(String),
                },
                data: {
                    processing: false,
                    processingToken: null,
                },
            }),
        );

        const retryResult = await service.handleWebhook(headers, event());

        expect(retryResult).toEqual({
            received: true,
            duplicate: false,
            eventId: 'event-1',
        });
        expect(invoiceSyncService.sync).toHaveBeenCalledTimes(2);
    });
});
