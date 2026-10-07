export interface PaypalAccessTokenResponse {
    access_token: string;
    token_type: string;
    app_id: string;
    expires_in: number;
    nonce?: string;
}

export interface PaypalLink {
    href: string;
    rel: string;
    method: string;
}

export interface PaypalOrderResponse {
    id: string;
    status: string;
    links?: PaypalLink[];

    purchase_units?: Array<{
        reference_id?: string;
        amount?: {
        currency_code?: string;
            value?: string;
        };
        payments?: {
            captures?: Array<{
                id: string;
                status: string;
                amount?: {
                    currency_code?: string;
                    value?: string;
                }
            }>
        };
    }>;
}