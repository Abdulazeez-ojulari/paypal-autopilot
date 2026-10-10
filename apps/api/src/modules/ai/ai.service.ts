import { Injectable } from "@nestjs/common";
import { AiProviderFactory } from "./providers/ai-provider.factory";
import { RevenueAgentResponse } from "./ai.types";
import { validateRevenueAgentResponse } from "./revenue-agent.validator";

@Injectable()
export class AiService {
    constructor(
        private readonly providerFactory: AiProviderFactory,
    ) {}

    async analyzeRevenue(
        revenueContext: Parameters<typeof validateRevenueAgentResponse>[0],
    ): Promise<RevenueAgentResponse> {
        const provider = this.providerFactory.getProvider();
        const result = await provider.analyzeRevenue(revenueContext);

        return validateRevenueAgentResponse(
            revenueContext,
            result,
        );
    }
}