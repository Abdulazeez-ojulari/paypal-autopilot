import { RevenueAgentResponse } from '../ai.types';

export interface AiProvider {
    analyzeRevenue(revenueContext: unknown): Promise<RevenueAgentResponse>;
}