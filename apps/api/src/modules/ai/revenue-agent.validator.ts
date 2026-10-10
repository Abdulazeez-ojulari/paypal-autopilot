
import { BadGatewayException } from '@nestjs/common';
import { RevenueAgentResponse } from './ai.types';

type RevenueOpportunityInput = {
    invoiceId: string;
    recommendedAction: string;
    estimatedRecovery: number;
};

type RevenueContextInput = {
    invoiceCount: number;
    totalOutstanding: string | number;
    estimatedRecovery: number;
    opportunities: RevenueOpportunityInput[];
};

function money(value: string | number): number {
    return Math.round(Number(value) * 100) / 100;
}

export function validateRevenueAgentResponse(
    context: RevenueContextInput,
    result: RevenueAgentResponse,
): RevenueAgentResponse {
    const fail = (message: string): never => {
        throw new BadGatewayException(`AI response validation failed: ${message}`);
    };

    if (
        result.decisions.length !== context.opportunities.length
    ) {
        return fail('Decision count does not match opportunity count');
    }

    if (
        new Set(result.decisions.map(d => d.invoiceId)).size !== result.decisions.length
    ) {
        return fail('Duplicate invoice decisions detected');
    }

    if (
        money(result.totalOutstanding) !== money(context.totalOutstanding)
    ) {
        return fail('AI changed total outstanding');
    }

    if (
        money(result.estimatedRecovery) !== money(context.estimatedRecovery)
    ) {
        return fail('AI changed total estimated recovery');
    }

    const decisionsByInvoice = new Map(result.decisions.map(d => [d.invoiceId, d]));

    for (const opportunity of context.opportunities) {
        const decision = decisionsByInvoice.get(opportunity.invoiceId);

        if (!decision) {
            return fail(`Missing decision for ${opportunity.invoiceId}`);
        }

        if (
            money(decision.estimatedRecovery) !== money(opportunity.estimatedRecovery)
        ) {
            return fail(`Recovery estimate changed for ${opportunity.invoiceId}`);
        }

        const expectedDecision = opportunity.recommendedAction;

        if (decision.decision !== expectedDecision) {
            return fail(`Unexpected action for ${opportunity.invoiceId}`);
        }

        const expectedApproval = expectedDecision === 'REVIEW_AND_SEND_PAYMENT_REQUEST';

        if (
            decision.requiresApproval !== expectedApproval
        ) {
            return fail(`Incorrect approval requirement for ${opportunity.invoiceId}`);
        }

        if (
            decision.reason.trim().length < 20 || decision.reason.trim() === decision.decision
        ) {
            return fail(`Explanation is not meaningful for ${opportunity.invoiceId}`);
        }
    }

    return result;
}