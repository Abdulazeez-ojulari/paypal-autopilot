
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PaypalClient } from './paypal.client';
import { PaypalWebhookEvent, PaypalWebhookResource } from './paypal.webhook.types';
import { PaypalInvoiceSyncService } from './paypal-invoice-sync.service';
import { randomUUID } from 'node:crypto';

type CaptureStatus = 'COMPLETED' | 'PENDING' | 'DENIED' | 'REFUNDED';

@Injectable()
export class PaypalWebhookService {
    private readonly logger = new Logger(PaypalWebhookService.name);
    private readonly staleClaimMs = 5 * 60 * 1000;

    constructor(
        private readonly prisma: PrismaService,
        private readonly paypalClient: PaypalClient,
        private readonly invoiceSyncService: PaypalInvoiceSyncService,
    ) {}

    async handleWebhook(
        headers: {
            auth_algo: string;
            cert_url: string;
            transmission_id: string;
            transmission_sig: string;
            transmission_time: string;
        },
        event: PaypalWebhookEvent,
    ) {
        if (!event?.id || !event?.event_type) {
            throw new BadRequestException('Invalid PayPal webhook event.');
        }

        // Always verify authenticity before trusting or processing the event.
        const verified = await this.paypalClient.verifyWebhookSignature(headers, event);

        if (!verified) {
            throw new BadRequestException('Invalid PayPal webhook signature.');
        }

        console.log(event)

        const storedEvent = await this.prisma.paypalWebhookEvent.upsert({
            where: { eventId: event.id },
            update: {},
            create: {
                eventId: event.id,
                eventType: event.event_type,
                resourceType: event.resource_type ?? null,
                resourceId: event.resource?.id ?? null,
                summary: event.summary ?? null,
            },
        });

        if (storedEvent.processed) {
            return {
                received: true,
                duplicate: true,
                eventId: event.id,
            };
        }

        const processingToken = randomUUID();
        const claimed = await this.claimEvent(event.id, processingToken);

        if (!claimed) {
            const current = await this.prisma.paypalWebhookEvent.findUnique({
                where: { eventId: event.id },
            });

            if (current?.processed) {
                return {
                    received: true,
                    duplicate: true,
                    eventId: event.id,
                };
            }

            return {
                received: true,
                duplicate: true,
                processing: Boolean(current?.processing),
                eventId: event.id,
            };
        }

        try {
            await this.processEvent(event);

            const completed = await this.prisma.paypalWebhookEvent.updateMany({
                where: {
                    eventId: event.id,
                    processed: false,
                    processing: true,
                    processingToken,
                },
                data: {
                    processed: true,
                    processing: false,
                    processingToken: null,
                    processedAt: new Date(),
                },
            });

            if (completed.count !== 1) {
                throw new Error(`Lost processing ownership for PayPal webhook ${event.id}.`);
            }

            return {
                received: true,
                duplicate: false,
                eventId: event.id,
            };
        } catch (error) {
            await this.prisma.paypalWebhookEvent.updateMany({
                where: {
                    eventId: event.id,
                    processed: false,
                    processing: true,
                    processingToken,
                },
                data: {
                    processing: false,
                    processingToken: null,
                },
            });

            this.logger.error(
                `Failed to process PayPal webhook ${event.id} (${event.event_type}).`,
                error instanceof Error ? error.stack : undefined,
            );

            throw error;
        }
    }

    private async claimEvent(
        eventId: string,
        processingToken: string,
    ): Promise<boolean> {
        const claimed = await this.prisma.paypalWebhookEvent.updateMany({
            where: {
                eventId,
                processed: false,
                processing: false,
            },
            data: {
                processing: true,
                processingToken,
            },
        });

        if (claimed.count === 1) {
            return true;
        }

        const staleBefore = new Date(Date.now() - this.staleClaimMs);

        const recovered = await this.prisma.paypalWebhookEvent.updateMany({
            where: {
                eventId,
                processed: false,
                processing: true,
                updatedAt: { lt: staleBefore },
            },
            data: {
                processing: true,
                processingToken,
            },
        });

        return recovered.count === 1;
    }

    private async processEvent(event: PaypalWebhookEvent): Promise<void> {
        switch (event.event_type) {
            case 'PAYMENT.CAPTURE.COMPLETED':
                await this.handleCaptureStatus(event.resource, 'COMPLETED');
                return;

            case 'PAYMENT.CAPTURE.PENDING':
                await this.handleCaptureStatus(event.resource, 'PENDING');
                return;

            case 'PAYMENT.CAPTURE.DENIED':
                await this.handleCaptureStatus(event.resource, 'DENIED');
                return;

            case 'PAYMENT.CAPTURE.REFUNDED':
                await this.handleCaptureStatus(event.resource, 'REFUNDED');
                return;

            case 'INVOICING.INVOICE.PAID':
            case 'INVOICING.INVOICE.SENT':
            case 'INVOICING.INVOICE.CANCELLED':
            case 'INVOICING.INVOICE.REFUNDED': {
                const invoiceId = event.resource?.invoice?.id ?? event.resource?.id;

                if (!invoiceId) {
                    this.logger.warn(`PayPal invoice event ${event.id} has no invoice ID.`);
                    return;
                }

                await this.invoiceSyncService.sync(invoiceId);
                return;
            }

            default:
                this.logger.log(`Ignoring PayPal event: ${event.event_type}`);
        }
    }

    private async handleCaptureStatus(
        resource: PaypalWebhookResource,
        status: CaptureStatus,
    ): Promise<void> {
        const captureId = resource?.id;

        if (!captureId) {
            this.logger.warn('PayPal capture webhook has no capture ID.');
            return;
        }

        const orderId = resource.supplementary_data?.related_ids?.order_id;

        if (!orderId) {
            this.logger.warn(`No order ID found for capture ${captureId}.`);
            return;
        }

        const amount = resource.amount?.value ?? null;
        const currencyCode = resource.amount?.currency_code ?? null;
        const idempotencyKey = `capture:${captureId}:${status}`;

        await this.prisma.$transaction(async (tx) => {
            const existingOrder = await tx.paypalOrder.findUnique({
                where: { paypalOrderId: orderId },
                select: { status: true },
            });

            const existingCapture = await tx.paypalCapture.findUnique({
                where: { paypalCaptureId: captureId },
                select: { status: true },
            });

            const shouldApplyStatus = this.canTransitionCaptureStatus(
                existingCapture?.status,
                status,
            );

            if (!shouldApplyStatus) {
                this.logger.warn(
                    `Ignoring stale PayPal capture status ${status} for ${captureId}; ` +
                    `current status is ${existingCapture?.status}.`,
                );
                return;
            }

            await tx.paypalOrder.updateMany({
                where: { paypalOrderId: orderId },
                data: { status },
            });

            await tx.paypalCapture.upsert({
                where: { paypalCaptureId: captureId },
                update: {
                    status,
                    currencyCode,
                    amount,
                },
                create: {
                    paypalCaptureId: captureId,
                    paypalOrderId: orderId,
                    status,
                    currencyCode,
                    amount,
                },
            });
            await tx.paypalPaymentEvent.upsert({
                where: { idempotencyKey },
                update: {},
                create: {
                    paypalOrderId: orderId,
                    paypalCaptureId: captureId,
                    source: 'PAYPAL_WEBHOOK',
                    eventType: `PAYMENT.CAPTURE.${status}`,
                    previousStatus: existingOrder?.status ?? null,
                    newStatus: status,
                    idempotencyKey,
                    metadata: { amount, currencyCode },
                },
            });
        });

        this.logger.log(`PayPal capture ${captureId} status synchronized: ${status}`);
    }

    private canTransitionCaptureStatus(
        currentStatus: string | null | undefined,
        nextStatus: CaptureStatus,
    ): boolean {
        if (!currentStatus || currentStatus === nextStatus) {
            return true;
        }

        switch (currentStatus) {
            case 'PENDING':
                return true;

            case 'COMPLETED':
                return nextStatus === 'REFUNDED';

            case 'DENIED':
                return false;

            case 'REFUNDED':
                return false;

            default:
                return true;
        }
    }
}