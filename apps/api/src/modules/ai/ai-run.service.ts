
import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { RevenueAgentResponse } from './ai.types';
import { PolicyEngineService } from './policy-engine.service';

@Injectable()
export class AiRunService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly policyEngine: PolicyEngineService,
    ) {}

    async recordRun(
        businessId: string,
        revenue: {
            invoiceCount: number;
            totalOutstanding: number;
            estimatedRecovery: number;
            opportunities: Array<{
                invoiceId: string;
                recommendedAction: string;
            }>;
        },
        analysis: RevenueAgentResponse,
    ) {
        const provider = (process.env.AI_PROVIDER ?? 'ollama').toLowerCase();
        const model = process.env.AI_MODEL ?? (provider === 'openai' ? 'gpt-4.1-mini' : 'qwen3:8b');

        const opportunitiesByInvoice = new Map(
            revenue.opportunities.map(opportunity => [ opportunity.invoiceId, opportunity ]),
        );

        const decisions = analysis.decisions.map(decision => {
            const opportunity = opportunitiesByInvoice.get(decision.invoiceId);

            if (!opportunity) {
                throw new Error(`No revenue opportunity found for ${decision.invoiceId}`);
            }

            const policy = this.policyEngine.evaluate(decision);

            return {
                invoiceId: decision.invoiceId,
                decision: decision.decision,
                reason: decision.reason,
                estimatedRecovery: decision.estimatedRecovery,
                requiresApproval: decision.requiresApproval,
                policyStatus: policy.status,
                policyReason: policy.reason,
            };
        });

        return this.prisma.$transaction(async tx => {
            const run = await tx.aiRun.create({
                data: {
                    businessId,
                    provider,
                    model,
                    status: 'COMPLETED',
                    invoiceCount: revenue.invoiceCount,
                    totalOutstanding: revenue.totalOutstanding,
                    estimatedRecovery: revenue.estimatedRecovery,
                    summary: analysis.summary
                },
            });

            await tx.aiDecision.createMany({
                data: decisions.map(decision => ({ aiRunId: run.id, ...decision })),
            });

            return {
                ...run,
                decisions: decisions.map(decision => ({
                    ...decision,
                    estimatedRecovery: Number(decision.estimatedRecovery),
                })),
            };
        });
    }

    async getRun(businessId: string, runId: string) {
        return this.prisma.aiRun.findFirst({
            where: {
                id: runId,
                businessId,
            },
            include: {
                decisions: {
                    orderBy: {
                        createdAt: 'asc',
                    },
                },
            },
        });
    }

    async getRecentRuns(businessId: string) {
        return this.prisma.aiRun.findMany({
            where: {
                businessId,
            },
            orderBy: {
                createdAt: 'desc',
            },
            take: 20,
            include: {
                _count: {
                    select: {
                        decisions: true,
                    },
                },
            },
        });
    }
}