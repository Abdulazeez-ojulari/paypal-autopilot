
import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma.service';
import { PaypalClient } from './paypal.client';

@Injectable()
export class PaypalInvoiceSyncService {
    private readonly logger = new Logger(PaypalInvoiceSyncService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly paypalClient: PaypalClient,
    ) {}

    async sync(paypalInvoiceId: string): Promise<{
        synchronized: boolean;
        reason?: string;
        localInvoiceId?: string;
        paypalStatus?: string;
        localStatus?: string;
    }> {
        // console.log("bkdjsll")
        if (!paypalInvoiceId) {
            return {
                synchronized: false,
                reason: 'Missing PayPal invoice ID',
            };
        }

        const externalInvoice = await this.paypalClient.getInvoice(paypalInvoiceId);

        if (externalInvoice.id !== paypalInvoiceId) {
            throw new Error('PayPal invoice ID mismatch.');
        }

        const localInvoiceId = externalInvoice.detail?.reference;

        if (!localInvoiceId) {
            this.logger.warn(`Invoice ${paypalInvoiceId} has no local reference.`);

            return {
                synchronized: false,
                reason: 'Missing local invoice reference',
                paypalStatus: externalInvoice.status,
            };
        }

        const invoice = await this.prisma.invoice.findUnique({
            where: { id: localInvoiceId },
        });

        if (!invoice) {
            this.logger.warn(`No local invoice found for PayPal invoice ${paypalInvoiceId}.`);

            return {
                synchronized: false,
                reason: 'Local invoice not found',
                localInvoiceId,
                paypalStatus: externalInvoice.status,
            };
        }

        const currency = externalInvoice.detail?.currency_code ?? externalInvoice.amount?.currency_code;

        if (
            !currency || currency.toUpperCase() !== invoice.currencyCode.toUpperCase()
        ) {
            throw new Error(`Currency mismatch for local invoice ${invoice.id}.`);
        }

        const paypalStatus = externalInvoice.status.toUpperCase();
        const rawPaidAmount = externalInvoice.payments?.paid_amount?.value;

        let paidAmount: Prisma.Decimal | undefined;

        if (rawPaidAmount !== undefined) {
            paidAmount = new Prisma.Decimal(rawPaidAmount);

            if (
                !paidAmount.isFinite() || paidAmount.isNegative() || paidAmount.greaterThan(invoice.amount)
            ) {
                throw new Error(`Invalid paid amount returned for invoice ${invoice.id}.`);
            }

            const paidCurrency = externalInvoice.payments?.paid_amount?.currency_code;

            if (
                paidCurrency && paidCurrency.toUpperCase() !== invoice.currencyCode.toUpperCase()
            ) {
                throw new Error(`Paid amount currency mismatch for invoice ${invoice.id}.`);
            }
        }

        const now = new Date();

        let localStatus: string | undefined;
        let nextPaidAmount = paidAmount;
        let paidAt: Date | null | undefined;

        switch (paypalStatus) {
            case 'PAID':
            case 'MARKED_AS_PAID':
            case 'PAID_EXTERNAL': {
                nextPaidAmount ??= new Prisma.Decimal(invoice.amount.toString());

                if (nextPaidAmount.lessThan(invoice.amount)) {
                    throw new Error(`PayPal reports ${paypalStatus}, but the recorded paid amount is below the invoice total.`);
                }

                localStatus = 'PAID';
                paidAt = invoice.paidAt ?? now;
                break;
            }

            case 'PARTIALLY_PAID': {
                if (!paidAmount || paidAmount.isZero()) {
                    throw new Error(`PayPal reports PARTIALLY_PAID without a valid paid amount for invoice ${invoice.id}.`);
                }

                localStatus = 'PARTIALLY_PAID';
                break;
            }

            case 'PAYMENT_PENDING':
                localStatus = 'PAYMENT_PENDING';
                break;

            case 'CANCELLED':
            case 'AUTO_CANCELLED':
                localStatus = 'CANCELLED';
                break;

            case 'REFUNDED':
            case 'MARKED_AS_REFUNDED':
            case 'REFUNDED_EXTERNAL':
                localStatus = 'REFUNDED';
                break;

            case 'PARTIALLY_REFUNDED':
                localStatus = 'PARTIALLY_REFUNDED';
                break;

            case 'SENT':
            case 'UNPAID':
            case 'SHARED':
                localStatus = invoice.dueAt < now ? 'OVERDUE' : 'UNPAID';
                break;

            default:
                this.logger.warn(`Unmapped PayPal invoice status "${paypalStatus}" for ${paypalInvoiceId}.`);

                return {
                    synchronized: false,
                    reason: 'Unmapped PayPal invoice status',
                    localInvoiceId,
                    paypalStatus,
                };
        }

        const data: Prisma.InvoiceUpdateInput = {
            status: localStatus,
        };

        if (nextPaidAmount !== undefined) {
            data.paidAmount = nextPaidAmount;
        }

        if (paidAt !== undefined) {
            data.paidAt = paidAt;
        }

        await this.prisma.invoice.update({
            where: { id: invoice.id },
            data,
        });

        this.logger.log(`Invoice ${invoice.id}: PayPal ${paypalStatus} -> local ${localStatus}`);

        return {
            synchronized: true,
            localInvoiceId: invoice.id,
            paypalStatus,
            localStatus,
        };
    }
}
