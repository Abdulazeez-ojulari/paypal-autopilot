import { Injectable, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { createHash } from 'crypto';

import { PaypalAccessTokenResponse, PaypalOrderResponse } from './paypal.types';

@Injectable()
export class PaypalClient {
    private readonly baseUrl: string;
    private readonly clientId: string;
    private readonly clientSecret: string;
    private readonly invoicerName: string;
    private readonly invoicerEmail: string;

    private accessToken?: string;
    private accessTokenExpiresAt = 0;

    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService
    ) {
        this.baseUrl = this.config.getOrThrow<string>('PAYPAL_API_BASE_URL');
        this.clientId = this.config.getOrThrow<string>('PAYPAL_CLIENT_ID');
        this.clientSecret = this.config.getOrThrow<string>('PAYPAL_CLIENT_SECRET');
        this.invoicerName = config.getOrThrow<string>('PAYPAL_INVOICER_NAME');
        this.invoicerEmail = config.getOrThrow<string>('PAYPAL_INVOICER_EMAIL');
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

    private requestId(attemptKey: string, operation: string): string {
        return createHash('sha256').update(`${attemptKey}:${operation}`).digest('hex').slice(0, 32);
    }

    async createDraftInvoice(input: {
        attemptKey: string;
        localInvoiceId: string;
        invoiceNumber: string;
        amount: string;
        currencyCode: string;
        customerName: string;
        customerEmail: string;
    }): Promise<{ id: string; status?: string }> {
        const token = await this.getAccessToken();

        const customerNames = input.customerName.trim().split(/\s+/);
        const givenName = customerNames.shift() || 'Customer';
        const surname = customerNames.join(' ') || undefined;

        const body = {
            detail: {
                invoice_number: `PA-${input.localInvoiceId.slice(-20)}`,
                reference: input.localInvoiceId,
                currency_code: input.currencyCode,
                payment_term: { term_type: 'DUE_ON_RECEIPT' },
                note: `Payment request for invoice ${input.invoiceNumber}.`,
            },
            invoicer: {
                name: { given_name: this.invoicerName },
                email_address: this.invoicerEmail,
            },
            primary_recipients: [
                {
                    billing_info: {
                        name: { given_name: givenName, surname },
                        email_address: input.customerEmail,
                    },
                },
            ],
            items: [
                {
                    name: `Payment for invoice ${input.invoiceNumber}`,
                    quantity: '1',
                    unit_amount: {
                        currency_code: input.currencyCode,
                        value: input.amount,
                    },
                },
            ],
        };

        try {
            const response = await firstValueFrom(
                this.http.post<{ id: string; status?: string }>(
                    `${this.baseUrl}/v2/invoicing/invoices`,
                    body,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            Prefer: 'return=representation',
                            'PayPal-Request-Id': this.requestId(input.attemptKey, 'create-invoice'),
                        },
                    },
                ),
            );

            if (!response.data.id) {
                throw new Error('PayPal did not return an invoice ID.');
            }

            return response.data;
        } catch(error) {
            console.log(error)
            throw new InternalServerErrorException('PayPal draft invoice creation failed or returned an uncertain result. Do not retry automatically; reconcile with PayPal first.');
        }
    }

    async sendInvoice(
        paypalInvoiceId: string,
        attemptKey: string,
    ): Promise<{ accepted: boolean; statusCode: number }> {
        const token = await this.getAccessToken();

        try {
            const response = await firstValueFrom(
                this.http.post(
                    `${this.baseUrl}/v2/invoicing/invoices/${encodeURIComponent(paypalInvoiceId)}/send`,
                    { send_to_recipient: true },
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            'Content-Type': 'application/json',
                            'PayPal-Request-Id': this.requestId(attemptKey, 'send-invoice'),
                        },
                        validateStatus: (status) => status === 200 || status === 202,
                    },
                ),
            );

            return {
                accepted: true,
                statusCode: response.status,
            };
        } catch {
            throw new InternalServerErrorException('PayPal invoice sending failed or returned an uncertain result. Reconcile with PayPal before retrying.');
        }
    }

    
    async getInvoice(paypalInvoiceId: string): Promise<{
        id: string;
        status: string;
        detail?: {
            reference?: string;
            currency_code?: string;
        };
        primary_recipients?: Array<{
            billing_info?: {
            email_address?: string;
            };
        }>;
    }> {
        const token = await this.getAccessToken();

        const response = await firstValueFrom(
            this.http.get(
                `${this.baseUrl}/v2/invoicing/invoices/${encodeURIComponent(paypalInvoiceId)}`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        Accept: 'application/json',
                    },
                },
            ),
        );

        if (!response.data?.id || !response.data?.status) {
            throw new Error('PayPal returned incomplete invoice details.');
        }

    return response.data;
    }

}