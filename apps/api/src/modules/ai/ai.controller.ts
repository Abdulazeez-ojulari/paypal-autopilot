import { Controller, Get, NotFoundException, Param, Post } from '@nestjs/common';
import { RevenueOpportunityService } from '../revenue/revenue-opportunity.service';
import { AiService } from './ai.service';
import { AiRunService } from './ai-run.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BusinessMembershipGuard } from '../auth/guards/business-membership.guard';

@UseGuards(JwtAuthGuard, BusinessMembershipGuard)
@Controller('ai')
export class AiController {
    constructor(
        private readonly aiService: AiService,
        private readonly revenueService: RevenueOpportunityService,
        private readonly aiRunService: AiRunService,
    ) {}

    @Post('businesses/:businessId/revenue-analysis')
    async analyzeRevenue(
        @Param('businessId') businessId: string,
    ) {
        const revenue =  await this.revenueService.getOpportunities(businessId);
        const analysis = await this.aiService.analyzeRevenue(revenue as any);

        const run = await this.aiRunService.recordRun(
            businessId,
            revenue,
            analysis,
        );

        return {
            runId: run.id,
            provider: run.provider,
            model: run.model,
            status: run.status,
            summary: run.summary,
            totalOutstanding: Number(run.totalOutstanding),
            estimatedRecovery: Number(run.estimatedRecovery),
            decisions: run.decisions,
        };

        // return {
        //     provider: process.env.AI_PROVIDER ?? 'ollama',
        //     model: process.env.AI_MODEL ?? 'qwen3:8b',
        //     ...analysis,
        // };
    }

    @Get('provider')
    getProvider() {
        return {
            provider: process.env.AI_PROVIDER ?? 'ollama',
            model: process.env.AI_MODEL ?? 'qwen3:8b',
        };
    }

    @Get('businesses/:businessId/runs')
    async getRecentRuns(
        @Param('businessId') businessId: string,
    ) {
        return this.aiRunService.getRecentRuns(businessId);
    }

    @Get('businesses/:businessId/runs/:runId')
    async getRun(
        @Param('businessId') businessId: string,
        @Param('runId') runId: string,
    ) {
        const run = await this.aiRunService.getRun(businessId, runId);

        if (!run) {
            throw new NotFoundException('AI run not found');
        }

        return run;
    }
}