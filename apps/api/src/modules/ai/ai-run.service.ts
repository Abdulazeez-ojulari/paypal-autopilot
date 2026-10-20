
import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { RevenueAgentResponse } from './ai.types';
import { PolicyEngineService } from './policy-engine.service';
import { Prisma } from '../../../generated/prisma/client';

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
                outstandingAmount: Prisma.Decimal;
                estimatedRecovery: Prisma.Decimal;
            }>;
        },
        analysis: RevenueAgentResponse,
    ) {
        const provider = (
            process.env.AI_PROVIDER ?? 'ollama'
        ).toLowerCase();

        const model = process.env.AI_MODEL ?? (provider === 'openai' ? 'gpt-4.1-mini' : 'qwen3:8b');

        const opportunitiesByInvoice = new Map(
            revenue.opportunities.map((opportunity) => [
                opportunity.invoiceId,
                opportunity,
            ]),
        );

        const decisions = analysis.decisions.map((decision) => {
            const opportunity = opportunitiesByInvoice.get(
                decision.invoiceId,
            );

            if (!opportunity) {
                throw new BadRequestException(`No revenue opportunity found for ${decision.invoiceId}`);
            }

            const outstanding = Number(opportunity.outstandingAmount);
            const recovery = Number(decision.estimatedRecovery);

            if (
                !Number.isFinite(outstanding) ||
                !Number.isFinite(recovery) ||
                outstanding <= 0 || recovery < 0 ||  recovery > outstanding
            ) {
                throw new BadRequestException(`Invalid recovery estimate for invoice ${decision.invoiceId}`);
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

        const totalOutstanding = revenue.opportunities.reduce(
            (sum, opportunity) => sum + Number(opportunity.outstandingAmount),
            0
        );

        const estimatedRecovery = revenue.opportunities.reduce(
            (sum, opportunity) => sum + Number(opportunity.estimatedRecovery),
            0,
        );

        if (
            !Number.isFinite(totalOutstanding) || !Number.isFinite(estimatedRecovery)
        ) {
            throw new BadRequestException('Revenue totals contain invalid monetary values');
        }

        return this.prisma.$transaction(async (tx) => {
            const run = await tx.aiRun.create({
                data: {
                    businessId,
                    provider,
                    model,
                    status: 'COMPLETED',
                    invoiceCount: revenue.opportunities.length,
                    totalOutstanding: Number(totalOutstanding.toFixed(2)),
                    estimatedRecovery: Number(estimatedRecovery.toFixed(2)),
                    summary: analysis.summary,
                },
            });

            await tx.aiDecision.createMany({
                data: decisions.map((decision) => ({
                    aiRunId: run.id,
                    ...decision,
                })),
            });

            return {
                ...run,
                decisions: decisions.map((decision) => ({
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