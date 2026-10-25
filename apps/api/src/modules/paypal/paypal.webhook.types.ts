
export interface PaypalWebhookEvent {
    id: string;
    event_type: string;
    resource: PaypalWebhookResource;

    event_version?: string;
    resource_version?: string;
    create_time?: string;
    resource_type?: string;
    summary?: string;

    // These can appear in PayPal's event lookup/delivery response.
    status?: string;
    transmissions?: PaypalWebhookTransmission[];
    links?: PaypalWebhookLink[];

    [key: string]: unknown;
}

export interface PaypalWebhookResource {
    // Capture resource fields
    id?: string;
    status?: string;
    amount?: PaypalMoney;
    supplementary_data?: {
        related_ids?: {
            order_id?: string;
            capture_id?: string;
            authorization_id?: string;
            [key: string]: unknown;
        };
        [key: string]: unknown;
    };

    // Invoice events wrap the invoice in resource.invoice.
    invoice?: PaypalInvoiceResource;

    // Retain support for additional PayPal event resources.
    [key: string]: unknown;
}

export interface PaypalInvoiceResource {
    id: string;
    status?: string;

    detail?: {
        reference?: string;
        currency_code?: string;
        note?: string;
        category_code?: string;
        invoice_number?: string;
        invoice_date?: string;
        payment_term?: {
            term_type?: string;
            due_date?: string;
            [key: string]: unknown;
        };
        metadata?: Record<string, unknown>;
        [key: string]: unknown;
    };

    amount?: PaypalInvoiceAmount;
    due_amount?: PaypalMoney;

    payments?: {
        paid_amount?: PaypalMoney;
        transactions?: PaypalInvoiceTransaction[];
        [key: string]: unknown;
    };

    items?: PaypalInvoiceItem[];
    primary_recipients?: PaypalInvoiceRecipient[];
    invoicer?: {
        name?: PaypalPersonName;
        email_address?: string;
        [key: string]: unknown;
    };

    links?: PaypalWebhookLink[];
    [key: string]: unknown;
}

export interface PaypalMoney {
    currency_code?: string;
    value?: string;
    [key: string]: unknown;
}

export interface PaypalInvoiceAmount extends PaypalMoney {
    breakdown?: {
        item_total?: PaypalMoney;
        tax_total?: PaypalMoney;
        discount?: {
            invoice_discount?: {
                amount?: PaypalMoney;
                [key: string]: unknown;
            };
            item_discount?: {
                amount?: PaypalMoney;
                [key: string]: unknown;
            };
            [key: string]: unknown;
        };
        [key: string]: unknown;
    };
}

export interface PaypalInvoiceTransaction {
    type?: string;
    payment_id?: string;
    transaction_type?: string;
    payment_date?: string;
    payment_date_time?: string;
    method?: string;
    amount?: PaypalMoney;
    transaction_status?: string;
    [key: string]: unknown;
}

export interface PaypalInvoiceItem {
    id?: string;
    name?: string;
    quantity?: string;
    unit_amount?: PaypalMoney;
    [key: string]: unknown;
}

export interface PaypalInvoiceRecipient {
    billing_info?: {
        name?: PaypalPersonName;
        email_address?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface PaypalPersonName {
    given_name?: string;
    surname?: string;
    full_name?: string;
    [key: string]: unknown;
}

export interface PaypalWebhookLink {
    href: string;
    rel?: string;
    method?: string;
    encType?: string;
    [key: string]: unknown;
}

export interface PaypalWebhookTransmission {
    webhook_url?: string;
    http_status?: number;
    reason_phrase?: string;
    transmission_id?: string;
    status?: string;
    timestamp?: string;
    response_headers?: Record<string, string>;
    [key: string]: unknown;
}
