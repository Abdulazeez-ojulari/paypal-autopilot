import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { PaypalAccessTokenResponse, PaypalOrderResponse } from './paypal.types';

@Injectable()
export class PaypalClient {
    private readonly baseUrl: string;
    private readonly clientId: string;
    private readonly clientSecret: string;

    private accessToken?: string;
    private accessTokenExpiresAt = 0;

    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService
    ) {
        this.baseUrl = this.config.getOrThrow<string>('PAYPAL_API_BASE_URL');
        this.clientId = this.config.getOrThrow<string>('PAYPAL_CLIENT_ID');
        this.clientSecret = this.config.getOrThrow<string>('PAYPAL_CLIENT_SECRET');
    }

    private async getAccessToken(): Promise<string> {
        const now = Date.now();

        if (this.accessToken && now < this.accessTokenExpiresAt) {
            return this.accessToken;
        }

        const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

        try {
            const response = await firstValueFrom(
                this.http.post<PaypalAccessTokenResponse>(
                    `${this.baseUrl}/v1/oauth2/token`,
                    'grant_type=client_credentials',
                    {
                        headers: {
                            Authorization: `Basic ${credentials}`,
                            'Content-Type':
                            'application/x-www-form-urlencoded'
                        },
                    }
                ));

            const token = response.data;

            this.accessToken = token.access_token;
            this.accessTokenExpiresAt = now + (token.expires_in - 60) * 1000;

            return token.access_token;
        } catch (error) {
            throw new UnauthorizedException('Unable to authenticate with PayPal');
        }
    }

    async createOrder(
        amount: string,
        currencyCode: string,
        description?: string
    ): Promise<PaypalOrderResponse> {
        const accessToken = await this.getAccessToken();

        try {
            const response = await firstValueFrom(
                this.http.post<PaypalOrderResponse>(
                    `${this.baseUrl}/v2/checkout/orders`,
                    {
                        intent: 'CAPTURE',
                        purchase_units: [
                            {
                                description,
                                amount: {
                                    currency_code: currencyCode,
                                    value: amount
                                }
                            }
                        ]
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                            'PayPal-Request-Id': `autopilot-${crypto.randomUUID()}`,
                            Prefer: 'return=representation'
                        }
                    }
                ));

            return response.data;
        } catch (error) {
            console.error(
                'PayPal create order error:',
                error instanceof Error ? error.message : "error.message"
            );

            throw new InternalServerErrorException('Unable to create PayPal order');
        }
    }

    async captureOrder(orderId: string): Promise<PaypalOrderResponse> {
        const accessToken = await this.getAccessToken();

        try {
            const response = await firstValueFrom(
                this.http.post<PaypalOrderResponse>(
                    `${this.baseUrl}/v2/checkout/orders/${orderId}/capture`,
                    {},
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Content-Type': 'application/json',
                            'PayPal-Request-Id': `capture-${orderId}`
                        }
                    }
                ));

            return response.data;
        } catch (error) {
            console.error(
                'PayPal capture error:',
                error instanceof Error ? error.message : "error.message"
            );

            throw new InternalServerErrorException('Unable to capture PayPal order');
        }
    }

    async getOrder(orderId: string): Promise<PaypalOrderResponse> {
        const accessToken = await this.getAccessToken();

        try {
            const response = await firstValueFrom(
                this.http.get<PaypalOrderResponse>(
                    `${this.baseUrl}/v2/checkout/orders/${orderId}`,
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                ));

            return response.data;
        } catch (error) {
            console.error(
                'PayPal get order error:',
                error instanceof Error ? error.message : "error.message"
            );

            throw new InternalServerErrorException('Unable to retrieve PayPal order');
        }
    }

    async getWebhookDetails(): Promise<unknown> {
        const accessToken = await this.getAccessToken();
        const response = await firstValueFrom(
            this.http.get(
                `${this.baseUrl}/v1/notifications/webhooks`,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            ))

        return response.data
    }

    async verifyWebhookSignature(
        headers: {
            auth_algo: string;
            cert_url: string;
            transmission_id: string;
            transmission_sig: string;
            transmission_time: string;
        },
        webhookEvent: unknown,
    ): Promise<boolean> {
        const accessToken = await this.getAccessToken();
        const response = await firstValueFrom(
                this.http.post(
                    `${this.baseUrl}/v1/notifications/verify-webhook-signature`,
                    {
                        auth_algo: headers.auth_algo,
                        cert_url: headers.cert_url,
                        transmission_id: headers.transmission_id,
                        transmission_sig: headers.transmission_sig,
                        transmission_time: headers.transmission_time,
                        webhook_id: process.env.PAYPAL_WEBHOOK_ID,
                        webhook_event: webhookEvent,
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${accessToken}`,
                            'Content-Type': 'application/json'
                        }
                    }
                ));

        // console.log(JSON.stringify(response.data))
        const result = response.data as {
            verification_status?: string;
        };

        return result.verification_status === 'SUCCESS';
    }
}