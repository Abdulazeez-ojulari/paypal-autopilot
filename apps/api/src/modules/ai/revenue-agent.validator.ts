
import { BadGatewayException } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client';
import { RevenueAgentResponse } from './ai.types';

type MoneyValue = string | number | Prisma.Decimal;

type RevenueOpportunityInput = {
    invoiceId: string;
    recommendedAction: string;
    outstandingAmount: MoneyValue;
    estimatedRecovery: MoneyValue;
};

type RevenueContextInput = {
    invoiceCount: number;
    totalOutstanding: MoneyValue;
    estimatedRecovery: MoneyValue;
    opportunities: RevenueOpportunityInput[];
};

function money(value: MoneyValue): number {
    return Math.round(Number(value) * 100) / 100;
}

function isValidMoney(value: unknown): value is MoneyValue {
    if (
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        !(value instanceof Prisma.Decimal)
    ) {
        return false;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0;
}

export function validateRevenueAgentResponse(
    context: RevenueContextInput,
    result: RevenueAgentResponse,
): RevenueAgentResponse {
    const fail = (message: string): never => {
        throw new BadGatewayException(`AI response validation failed: ${message}`);
    };

    if (!result || typeof result !== 'object') {
        return fail('Response is not a valid object');
    }

    if (!Array.isArray(context.opportunities)) {
        return fail('Revenue opportunities are invalid');
    }

    if (!Array.isArray(result.decisions)) {
        return fail('Decisions must be an array');
    }

    if (
        !Number.isInteger(context.invoiceCount) || context.invoiceCount !== context.opportunities.length
    ) {
        return fail('Invoice count does not match opportunity count');
    }

    if (result.decisions.length !== context.opportunities.length) {
        return fail('Decision count does not match opportunity count');
    }

    if (typeof result.summary !== 'string' || !result.summary.trim()) {
        return fail('Summary is missing or invalid');
    }

    if (
        !isValidMoney(context.totalOutstanding) ||
        !isValidMoney(context.estimatedRecovery) ||
        !isValidMoney(result.totalOutstanding) ||
        !isValidMoney(result.estimatedRecovery)
    ) {
        return fail('Revenue totals contain invalid monetary values');
    }

    const invoiceIds = context.opportunities.map(o => o.invoiceId);

    if (invoiceIds.some(id => typeof id !== 'string' || !id.trim())) {
        return fail('An opportunity has an invalid invoice ID');
    }

    if (new Set(invoiceIds).size !== invoiceIds.length) {
        return fail('Duplicate invoice opportunities detected');
    }

    if (
        new Set(result.decisions.map(d => d.invoiceId)).size !==
        result.decisions.length
    ) {
        return fail('Duplicate invoice decisions detected');
    }

    const expectedOutstanding = context.opportunities.reduce((sum, o) => {
        if (!isValidMoney(o.outstandingAmount)) {
            return fail(`Invalid outstanding amount for ${o.invoiceId}`);
        }

        return sum + money(o.outstandingAmount);
    }, 0);

    const expectedRecovery = context.opportunities.reduce((sum, o) => {
        if (!isValidMoney(o.estimatedRecovery)) {
            return fail(`Invalid recovery estimate for ${o.invoiceId}`);
        }

        const outstanding = money(o.outstandingAmount);
        const recovery = money(o.estimatedRecovery);

        if (recovery > outstanding) {
            return fail(`Recovery exceeds outstanding balance for ${o.invoiceId}`);
        }

        return sum + recovery;
    }, 0);

    if (money(context.totalOutstanding) !== money(expectedOutstanding)) {
        return fail('Context outstanding total does not match its opportunities');
    }

    if (money(context.estimatedRecovery) !== money(expectedRecovery)) {
        return fail('Context recovery total does not match its opportunities');
    }

    if (money(result.totalOutstanding) !== money(context.totalOutstanding)) {
        return fail('AI changed total outstanding');
    }

    if (money(result.estimatedRecovery) !== money(context.estimatedRecovery)) {
        return fail('AI changed total estimated recovery');
    }

    const decisionsByInvoice = new Map(
        result.decisions.map(d => [d.invoiceId, d]),
    );

    const supportedActions = new Set([
        'SEND_PAYMENT_REMINDER',
        'REVIEW_AND_SEND_PAYMENT_REQUEST',
    ]);

    for (const opportunity of context.opportunities) {
        const decision = decisionsByInvoice.get(opportunity.invoiceId);

        if (!decision) {
            return fail(`Missing decision for ${opportunity.invoiceId}`);
        }

        if (!supportedActions.has(opportunity.recommendedAction)) {
            return fail(`Unsupported opportunity action for ${opportunity.invoiceId}`);
        }

        if (
            !isValidMoney(decision.estimatedRecovery) || money(decision.estimatedRecovery) !== money(opportunity.estimatedRecovery)
        ) {
            return fail(`Recovery estimate changed for ${opportunity.invoiceId}`);
        }

        if (decision.decision !== opportunity.recommendedAction) {
            return fail(`Unexpected action for ${opportunity.invoiceId}`);
        }

        const expectedApproval = opportunity.recommendedAction === 'REVIEW_AND_SEND_PAYMENT_REQUEST';

        if (decision.requiresApproval !== expectedApproval) {
            return fail(`Incorrect approval requirement for ${opportunity.invoiceId}`);
        }

        if (
            typeof decision.reason !== 'string' || decision.reason.trim().length < 20 || decision.reason.trim() === decision.decision
        ) {
            return fail(`Explanation is not meaningful for ${opportunity.invoiceId}`);
        }
    }

    return result;
}
