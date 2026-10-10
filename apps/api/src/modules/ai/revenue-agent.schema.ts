export const REVENUE_AGENT_JSON_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    properties: {
        summary: {
            type: 'string',
        },
        totalOutstanding: {
            type: 'number',
            minimum: 0,
        },
        estimatedRecovery: {
            type: 'number',
            minimum: 0,
        },
        decisions: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                    invoiceId: {
                        type: 'string',
                    },
                    decision: {
                        type: 'string',
                        enum: [
                            'SEND_PAYMENT_REMINDER',
                            'REVIEW_AND_SEND_PAYMENT_REQUEST',
                            'NO_ACTION',
                        ],
                    },
                    reason: {
                        type: 'string',
                    },
                    estimatedRecovery: {
                        type: 'number',
                        minimum: 0,
                    },
                    requiresApproval: {
                        type: 'boolean',
                    },
                },

                required: [
                    'invoiceId',
                    'decision',
                    'reason',
                    'estimatedRecovery',
                    'requiresApproval',
                ],
            },
        },
    },

    required: [
        'summary',
        'totalOutstanding',
        'estimatedRecovery',
        'decisions',
    ],
} as const;