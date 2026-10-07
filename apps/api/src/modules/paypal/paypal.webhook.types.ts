export interface PaypalWebhookEvent {
    id: string;
    event_version?: string;
    create_time?: string;
    resource_type?: string;
    event_type: string;
    summary?: string;
    resource: PaypalWebhookResource;
}

export interface PaypalWebhookResource {
    id?: string;
    status?: string;
    amount?: {
        currency_code?: string;
        value?: string;
    };
    supplementary_data?: {
        related_ids?: {
            order_id?: string;
        };
    };
    invoice_id?: string;

    [key: string]: unknown;
}