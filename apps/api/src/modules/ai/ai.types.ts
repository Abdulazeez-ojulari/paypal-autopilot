import { z } from 'zod';

export const RevenueDecisionSchema = z.object({
    invoiceId: z.string(),
    decision: z.enum([
        'SEND_PAYMENT_REMINDER',
        'REVIEW_AND_SEND_PAYMENT_REQUEST',
        'NO_ACTION'
    ]),
    reason: z.string(),
    estimatedRecovery: z.number().nonnegative(),
    requiresApproval: z.boolean(),
});

export const RevenueAgentResponseSchema = z.object({
        summary: z.string(),
        totalOutstanding: z.number().nonnegative(),
        estimatedRecovery: z.number().nonnegative(),
        decisions: z.array(RevenueDecisionSchema),
    });

export type RevenueDecision = z.infer<typeof RevenueDecisionSchema>;

export type RevenueAgentResponse = z.infer<typeof RevenueAgentResponseSchema>;