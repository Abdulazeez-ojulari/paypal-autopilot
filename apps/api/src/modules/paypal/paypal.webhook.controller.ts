import { Body, Controller, Headers, Post } from '@nestjs/common';
import { PaypalWebhookService } from './paypal.webhook.service';
import type { PaypalWebhookEvent } from './paypal.webhook.types';

@Controller('paypal/webhooks')
export class PaypalWebhookController {
    constructor(
        private readonly webhookService: PaypalWebhookService,
    ) {}

    @Post()
    async handleWebhook(
        @Headers('paypal-auth-algo')
        authAlgo: string,

        @Headers('paypal-cert-url')
        certUrl: string,

        @Headers('paypal-transmission-id')
        transmissionId: string,

        @Headers('paypal-transmission-sig')
        transmissionSig: string,

        @Headers('paypal-transmission-time')
        transmissionTime: string,

        @Body()
        event: PaypalWebhookEvent,
    ) {
        return this.webhookService.handleWebhook(
            {
                auth_algo: authAlgo,
                cert_url: certUrl,
                transmission_id: transmissionId,
                transmission_sig: transmissionSig,
                transmission_time: transmissionTime,
            },
            event,
        );
    }
}