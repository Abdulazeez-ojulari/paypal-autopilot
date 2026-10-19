import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PaypalController } from './paypal.controller';
import { PaypalService } from './paypal.service';
import { PaypalClient } from './paypal.client';
import { PaypalWebhookService } from './paypal.webhook.service';
import { PaypalWebhookController } from './paypal.webhook.controller';
import { PaypalPaymentEventService } from './paypal.payment-event.service';
import { PaypalInvoiceSyncService } from './paypal-invoice-sync.service';

@Module({
    imports: [HttpModule],

    controllers: [
        PaypalController,
        PaypalWebhookController,
    ],

    providers: [
        PaypalService,
        PaypalClient,
        PaypalWebhookService,
        PaypalPaymentEventService,
        PaypalInvoiceSyncService,
    ],

    exports: [
        PaypalService,
        PaypalClient,
        PaypalPaymentEventService,
    ],
})
export class PaypalModule {}