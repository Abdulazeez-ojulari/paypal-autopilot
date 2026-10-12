
import { Injectable } from '@nestjs/common';
import { RevenueDecision } from './ai.types';

export type PolicyResult = {
    status: 'ELIGIBLE_NOT_EXECUTED' | 'REQUIRES_HUMAN_APPROVAL';
    reason: string;
};

@Injectable()
export class PolicyEngineService {
    evaluate(decision: RevenueDecision): PolicyResult {
        if (
            decision.decision === 'REVIEW_AND_SEND_PAYMENT_REQUEST'
        ) {
            return {
                status: 'REQUIRES_HUMAN_APPROVAL',
                reason: 'A payment request requires explicit human approval before execution.',
            };
        }

        if (
            decision.decision === 'SEND_PAYMENT_REMINDER'
        ) {
            return {
                status: 'ELIGIBLE_NOT_EXECUTED',
                reason: 'The reminder passes the current policy checks, but no message has been sent.',
            };
        }

        return {
            status: 'ELIGIBLE_NOT_EXECUTED',
            reason: 'No financial action will be executed by this analysis.',
        };
    }
}