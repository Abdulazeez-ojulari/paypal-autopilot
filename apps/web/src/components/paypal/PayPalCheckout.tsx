'use client';

import { useEffect, useRef, useState } from 'react';

declare global {
    interface Window {
        paypal?: {
            Buttons: (options: {
                createOrder: () => Promise<string>;
                onApprove: (data: {
                    orderID: string;
                }) => Promise<void>;
                onCancel?: () => void;
                onError?: (error: unknown) => void;
            }) => {
                render: (selector: string) => Promise<void>;
            };
        };
    }
}

interface PayPalCheckoutProps {
    amount: number;
    currencyCode?: string;
    description?: string;
}

export function PayPalCheckout({
    amount,
    currencyCode = 'USD',
    description = 'PayPal Autopilot Test Purchase',
}: PayPalCheckoutProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    const [loading, setLoading] = useState(true);

    const [status, setStatus] = useState<string | null>(null);

    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;

        if (!clientId) {
            // setError('PayPal client ID is not configured.');

            setLoading(false);

            return;
        }

        const existingScript = document.getElementById('paypal-js-sdk');

        const renderButtons = () => {
            if (!window.paypal) {
                setError('PayPal SDK failed to load.');
                setLoading(false);

                return;
            }

            if (!containerRef.current) {
                return;
            }

            containerRef.current.innerHTML = '';

            window.paypal.Buttons({
                async createOrder() {
                    setStatus('Creating PayPal order...');

                    setError(null);

                    const response = await fetch(
                        `${process.env.NEXT_PUBLIC_API_URL}/paypal/orders`,
                        {
                            method: 'POST',

                            headers: {
                                'Content-Type': 'application/json',
                            },

                            body: JSON.stringify({
                                amount,
                                currencyCode,
                                description,
                            }),
                        },
                    );

                    if (!response.ok) {
                        throw new Error('Unable to create PayPal order.');
                    }

                    const data = await response.json();

                    setStatus('Order created. Waiting for approval...');

                    return data.orderId;
                },

                async onApprove(data) {
                    setStatus('Payment approved. Capturing payment...');
                    setError(null);

                    const response = await fetch(
                        `${process.env.NEXT_PUBLIC_API_URL}/paypal/orders/${data.orderID}/capture`,
                        {
                            method: 'POST',

                            headers: {
                                'Content-Type': 'application/json',
                            },
                        },
                    );

                    const result = await response.json();

                    if (!response.ok) {
                        throw new Error(result.message ?? 'Unable to capture PayPal order.');
                    }

                    setStatus(`Payment captured. Waiting for PayPal confirmation...`);
                },

                onCancel() {
                    setStatus('Payment was cancelled.');
                },

                onError(paypalError) {
                    console.error( 'PayPal error:', paypalError);
                    setError('Something went wrong with PayPal checkout.');
                },
            })
            .render('#paypal-button-container')
            .finally(() => {
                setLoading(false);
            });
        };

        if (existingScript) {
            renderButtons();

            return;
        }

        const script = document.createElement('script');

        script.id = 'paypal-js-sdk';
        script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=${currencyCode}&intent=capture&components=buttons`;
        script.async = true;

        script.onload = renderButtons;
        script.onerror = () => {
            setError('Unable to load PayPal SDK.');
            setLoading(false);
        };

        document.body.appendChild(script);

        return () => {
        // Don't remove the shared PayPal SDK script.
        };
    }, [ amount, currencyCode, description ]);

    return (
        <div className="w-full">
            <div ref={containerRef} id="paypal-button-container" />

            {loading && (
                <p className="mt-3 text-sm text-gray-500"> Loading PayPal... </p>
            )}

            {status && (
                <div className="mt-4 rounded-lg bg-gray-50 p-4 text-sm">
                    {status}
                </div>
            )}

            {error && (
                <div className="mt-4 rounded-lg bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            )}
        </div>
    );
}