
import { Injectable } from '@nestjs/common';
import { PaypalClient } from '../paypal/paypal.client';

@Injectable()
export class PaypalInvoicingService {

    constructor(
        private readonly paypalClient: PaypalClient,
    ) {}

    async createDraftInvoice(input: {
        attemptKey: string;
        localInvoiceId: string;
        invoiceNumber: string;
        amount: string;
        currencyCode: string;
        customerName: string;
        customerEmail: string;
    }): Promise<{ id: string; status?: string }> {
        return this.paypalClient.createDraftInvoice({
            attemptKey: input.attemptKey,
            localInvoiceId: input.localInvoiceId,
            invoiceNumber: input.invoiceNumber,
            amount: input.amount,
            currencyCode: input.currencyCode,
            customerName: input.customerName,
            customerEmail: input.customerEmail,
        });
    }

    async sendInvoice(
        paypalInvoiceId: string,
        attemptKey: string,
    ): Promise<{ accepted: boolean; statusCode: number }> {
        return this.paypalClient.sendInvoice(
            paypalInvoiceId,
            attemptKey
        )
    }

    
    async getInvoice(paypalInvoiceId: string): Promise<{
        id: string;
        status: string;
        detail?: {
            reference?: string;
            currency_code?: string;
        };
        amount?: {
            currency_code?: string;
            value?: string;
        };
        payments?: {
            paid_amount?: {
                currency_code?: string;
                value?: string;
            };
        };
        primary_recipients?: Array<{
            billing_info?: {
                    email_address?: string;
            };
        }>;
    }> {
        return this.paypalClient.getInvoice(paypalInvoiceId);
    }

}
