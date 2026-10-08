import { Injectable, NotFoundException } from '@nestjs/common';
import { PaypalClient } from './paypal.client';
import { CreatePaypalOrderDto } from './dto/create-paypal-order.dto';
import { PrismaService } from 'src/prisma.service';

@Injectable()
export class PaypalService {
    constructor(
        private readonly paypalClient: PaypalClient,
        private readonly prisma: PrismaService,
    ) {}

    async createOrder(dto: CreatePaypalOrderDto) {

        const order = await this.paypalClient.createOrder(dto.amount.toFixed(2), dto.currencyCode, dto.description);
        const approvalLink = order.links?.find((link) => link.rel === 'payer-action' || link.rel === 'approve');

        await this.prisma.paypalOrder.create({
            data: {
                paypalOrderId: order.id,
                status: order.status,
                currencyCode: dto.currencyCode,
                amount: dto.amount,
                approvalUrl: approvalLink?.href ?? null,
            },
        });

        return {
            orderId: order.id,
            status: order.status,
            approvalUrl: approvalLink?.href ?? null,
            paypal: order,
        };
    }

    async captureOrder(orderId: string) {
        if (!orderId) {
            throw new NotFoundException('PayPal order ID is required');
        }

        const order = await this.paypalClient.captureOrder(orderId);
        const capture = order.purchase_units?.flatMap((unit) => unit.payments?.captures ?? []).at(0);

        if (capture) {
            await this.prisma.paypalCapture.upsert({
                where: {
                    paypalCaptureId: capture.id,
                },

                create: {
                    paypalCaptureId: capture.id,
                    paypalOrderId: order.id,
                    status: capture.status,
                    currencyCode: capture.amount?.currency_code,
                    amount: capture.amount?.value,
                },

                update: {
                    status: capture.status,
                    currencyCode: capture.amount?.currency_code,
                    amount: capture.amount?.value,
                },
            });
        }

        const existingOrder = await this.prisma.paypalOrder.findUnique({
                where: {
                    paypalOrderId: orderId,
                },
            });

        const previousStatus = existingOrder?.status ?? null;

        if (capture) {
            await this.prisma.$transaction(
                async (tx) => {

                    await tx.paypalOrder.updateMany({
                        where: {
                            paypalOrderId: order.id,
                        },

                        data: {
                            status: order.status,
                        },
                    });

                    await tx.paypalCapture.upsert({
                        where: {
                            paypalCaptureId: capture.id,
                        },

                        create: {
                            paypalCaptureId: capture.id,
                            paypalOrderId: order.id,
                            status: capture.status,
                            currencyCode: capture.amount?.currency_code,
                            amount: capture.amount?.value,
                        },

                        update: {
                            status: capture.status,
                            currencyCode: capture.amount?.currency_code,
                            amount: capture.amount?.value,
                        },
                    });

                    await tx.paypalPaymentEvent.create({
                        data: {
                            paypalOrderId: orderId,
                            paypalCaptureId: capture.id,
                            source: 'PAYPAL_API',
                            eventType: `PAYMENT.CAPTURE`,
                            previousStatus,
                            newStatus: capture.status,
                            metadata: {
                                amount: capture.amount?.value,
                                currencyCode: capture.amount?.currency_code,
                            },
                        },
                    });
                },
            );
        }

        return {
            orderId: order.id,
            status: order.status,
            captureId: capture?.id ?? null,
            captureStatus: capture?.status ?? null,
            amount: capture?.amount ?? null,
            paypal: order,
        };
    }

    async getOrder(orderId: string) {
        return this.paypalClient.getOrder(orderId);
    }
}