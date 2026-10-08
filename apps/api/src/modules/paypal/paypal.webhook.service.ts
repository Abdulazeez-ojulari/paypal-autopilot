import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { PaypalClient } from './paypal.client';
import { PaypalWebhookEvent, PaypalWebhookResource } from './paypal.webhook.types';
import { PaypalPaymentEventService } from './paypal.payment-event.service';

@Injectable()
export class PaypalWebhookService {
    private readonly logger = new Logger(PaypalWebhookService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly paypalClient: PaypalClient,
        private readonly paymentEventService: PaypalPaymentEventService,
    ) {}

    async handleWebhook(
        headers: {
            auth_algo: string;
            cert_url: string;
            transmission_id: string;
            transmission_sig: string;
            transmission_time: string;
        },
        event: PaypalWebhookEvent
    ) {
        if (!event?.id || !event?.event_type) {
            throw new BadRequestException('Invalid PayPal webhook event.');
        }

        const existingEvent =
            await this.prisma.paypalWebhookEvent.findUnique({
                where: {
                    eventId: event.id,
                },
            });

        if (existingEvent?.processed) {
            return {
                received: true,
                duplicate: true,
                eventId: event.id,
            };
        }

        // console.log(event)

        const verified =
            await this.paypalClient.verifyWebhookSignature(
                headers,
                event,
            );

        // console.log(verified)

        if (!verified) {
            throw new BadRequestException('Invalid PayPal webhook signature.');
        }

        const webhookEvent =
        await this.prisma.paypalWebhookEvent.upsert({
            where: {
                eventId: event.id,
            },
            update: {},
            create: {
                eventId: event.id,
                eventType: event.event_type,
                resourceType: event.resource_type ?? null,
                resourceId: event.resource?.id ?? null,
                summary: event.summary ?? null,
            },
        });

        console.log(webhookEvent, "Sdfsdfs")

        await this.processEvent(event);

        await this.prisma.paypalWebhookEvent.update({
            where: {
                id: webhookEvent.id,
            },
            data: {
                processed: true,
                processedAt: new Date(),
            },
        });

        return {
            received: true,
            duplicate: false,
            eventId: event.id,
        };
    }

    private async processEvent(event: PaypalWebhookEvent) {
        switch (event.event_type) {
            case 'PAYMENT.CAPTURE.COMPLETED':
                await this.handleCaptureCompleted(event.resource);
                break;

            case 'PAYMENT.CAPTURE.PENDING':
                await this.handleCaptureStatus(event.resource, 'PENDING');
                break;

            case 'PAYMENT.CAPTURE.DENIED':
                await this.handleCaptureStatus(event.resource, 'DENIED');
                break;

            case 'PAYMENT.CAPTURE.REFUNDED':
                await this.handleCaptureStatus(event.resource, 'REFUNDED');
                break;

            default:
                this.logger.log(`Ignoring PayPal event: ${event.event_type}`);
        }
    }

    private async handleCaptureCompleted(resource: PaypalWebhookResource) {
        await this.handleCaptureStatus(resource, 'COMPLETED');
    }

    private async handleCaptureStatus(
        resource: PaypalWebhookResource,
        status: string,
    ) {
        const captureId = resource.id;

        if (!captureId) {
            this.logger.warn('PayPal webhook has no capture ID.');
            return;
        }

        const orderId = resource.supplementary_data?.related_ids?.order_id;

        if (!orderId) {
            this.logger.warn(`No order ID found for capture ${captureId}.`);
            return;
        }

        const amount = resource.amount?.value ?? null;
        const currencyCode = resource.amount?.currency_code ?? null;

        const existingOrder = await this.prisma.paypalOrder.findUnique({
                where: {
                    paypalOrderId: orderId,
                },
            });

        const previousStatus = existingOrder?.status ?? null;

        await this.prisma.$transaction(
            async (tx) => {
                await tx.paypalOrder.updateMany({
                    where: {
                        paypalOrderId: orderId,
                    },
                    data: {
                        status,
                    },
                });

                await tx.paypalCapture.upsert({
                    where: {
                        paypalCaptureId: captureId,
                    },

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

                await tx.paypalPaymentEvent.create({
                    data: {
                        paypalOrderId: orderId,
                        paypalCaptureId: captureId,
                        source: 'PAYPAL_WEBHOOK',
                        eventType: `PAYMENT.CAPTURE.${status}`,
                        previousStatus,
                        newStatus: status,
                        metadata: {
                            amount,
                            currencyCode,
                        },
                    },
                });
            },
        );

        this.logger.log( `Payment ${captureId}: ${previousStatus} -> ${status}`);
    }
}