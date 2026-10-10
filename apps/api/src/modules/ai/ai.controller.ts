import { Controller, Get, Param, Post } from '@nestjs/common';
import { RevenueOpportunityService } from '../revenue/revenue-opportunity.service';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
    constructor(
        private readonly aiService: AiService,
        private readonly revenueService: RevenueOpportunityService,
    ) {}

    @Post('businesses/:businessId/revenue-analysis')
    async analyzeRevenue(
        @Param('businessId') businessId: string,
    ) {
        const revenue =  await this.revenueService.getOpportunities(businessId);
        const analysis = await this.aiService.analyzeRevenue(revenue as any);

        return {
            provider: process.env.AI_PROVIDER ?? 'ollama',
            model: process.env.AI_MODEL ?? 'qwen3:8b',
            ...analysis,
        };
    }

    @Get('provider')
    getProvider() {
        return {
            provider: process.env.AI_PROVIDER ?? 'ollama',
            model: process.env.AI_MODEL ?? 'qwen3:8b',
        };
    }
}