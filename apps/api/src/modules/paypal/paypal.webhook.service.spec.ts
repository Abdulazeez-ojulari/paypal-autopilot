
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
        prisma.paypalWebhookEvent.findUnique.mockResolvedValue({
            id: 'db-event-1',
            processed: true,
        });

        const result = await service.handleWebhook(headers, event());

        expect(paypalClient.verifyWebhookSignature).toHaveBeenCalledWith(headers, event());
        expect(prisma.paypalWebhookEvent.findUnique).toHaveBeenCalledWith({
            where: { eventId: 'event-1' },
        });
        expect(result).toEqual({
            received: true,
            duplicate: true,
            eventId: 'event-1',
        });
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

        expect(prisma.paypalWebhookEvent.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: 'db-event-1' },
                data: expect.objectContaining({
                    processed: true,
                    processedAt: expect.any(Date),
                }),
            })
        );

        expect(result).toEqual({ received: true, duplicate: false, eventId: 'event-1' });
    });

    it('does not mark an event processed when invoice synchronization fails', async () => {
        invoiceSyncService.sync.mockRejectedValue(new Error('PayPal invoice lookup failed'));

        await expect(
            service.handleWebhook(headers, event()),
        ).rejects.toThrow('PayPal invoice lookup failed');

        expect(prisma.paypalWebhookEvent.update).not.toHaveBeenCalled();
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

        expect(prisma.paypalPaymentEvent.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    paypalOrderId: 'order-1',
                    paypalCaptureId: 'capture-1',
                    source: 'PAYPAL_WEBHOOK',
                    eventType: 'PAYMENT.CAPTURE.COMPLETED',
                    newStatus: 'COMPLETED',
                }),
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
        expect(prisma.paypalWebhookEvent.update).toHaveBeenCalled();
        expect(result.duplicate).toBe(false);
    });
});
