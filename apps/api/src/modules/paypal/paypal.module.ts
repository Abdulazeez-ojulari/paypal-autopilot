import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { PaypalController } from './paypal.controller';
import { PaypalService } from './paypal.service';
import { PaypalClient } from './paypal.client';
import { PaypalWebhookService } from './paypal.webhook.service';
import { PaypalWebhookController } from './paypal.webhook.controller';

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
    ],

    exports: [
        PaypalService,
        PaypalClient
    ],
})
export class PaypalModule {}