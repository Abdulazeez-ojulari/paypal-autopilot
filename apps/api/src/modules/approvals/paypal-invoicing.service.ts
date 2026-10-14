
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
}
