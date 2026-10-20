
import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma.service';
import { AiRunService } from './ai-run.service';
import { PolicyEngineService } from './policy-engine.service';

describe('AiRunService', () => {
    let service: AiRunService;

    const tx = {
        aiRun: {
            create: jest.fn(),
        },
        aiDecision: {
            createMany: jest.fn(),
        },
    };

    const prisma = {
        $transaction: jest.fn(),
    };

    const policyEngine = {
        evaluate: jest.fn().mockReturnValue({
            status: 'ELIGIBLE_NOT_EXECUTED',
            reason: 'Test policy result',
        }),
    };

    const revenue = {
        invoiceCount: 2,
        // Intentionally inconsistent: recordRun should calculate from opportunities.
        totalOutstanding: 999,
        estimatedRecovery: 999,
        opportunities: [
            {
                invoiceId: 'invoice-1',
                recommendedAction: 'SEND_PAYMENT_REMINDER',
                outstandingAmount: 60 as any,
                estimatedRecovery: 51 as any,
            },
            {
                invoiceId: 'invoice-2',
                recommendedAction: 'REVIEW_AND_SEND_PAYMENT_REQUEST',
                outstandingAmount: 200 as any,
                estimatedRecovery: 90 as any,
            },
        ],
    };

    const analysis = {
        summary: 'Test revenue analysis',
        decisions: [
            {
                invoiceId: 'invoice-1',
                decision: 'SEND_PAYMENT_REMINDER',
                reason: 'A reminder may help recover the balance.',
                estimatedRecovery: 51,
                requiresApproval: false,
            },
            {
                invoiceId: 'invoice-2',
                decision: 'REVIEW_AND_SEND_PAYMENT_REQUEST',
                reason: 'Review this overdue balance.',
                estimatedRecovery: 90,
                requiresApproval: true,
            },
        ],
    };

    beforeEach(async () => {
        jest.clearAllMocks();

        const module: TestingModule = await Test.createTestingModule({
            providers: [
                AiRunService,
                { provide: PrismaService, useValue: prisma },
                { provide: PolicyEngineService, useValue: policyEngine },
            ],
        }).compile();

        service = module.get(AiRunService);

        tx.aiRun.create.mockResolvedValue({
            id: 'run-1',
            businessId: 'business-1',
            provider: 'ollama',
            model: 'gpt-oss:20b',
            status: 'COMPLETED',
            invoiceCount: 2,
            totalOutstanding: 260,
            estimatedRecovery: 141,
            summary: 'Test revenue analysis',
        });

        tx.aiDecision.createMany.mockResolvedValue({ count: 2 });

        prisma.$transaction.mockImplementation(
            async (callback: (transaction: typeof tx) => unknown) => callback(tx)
        );
    });

    it('saves totals calculated from outstanding opportunities', async () => {
        await service.recordRun(
            'business-1',
            revenue,
            analysis as any,
        );

        expect(tx.aiRun.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                businessId: 'business-1',
                invoiceCount: 2,
                totalOutstanding: 260,
                estimatedRecovery: 141,
                summary: 'Test revenue analysis',
            }),
        });
    });

    it('records AI decisions with policy results', async () => {
        await service.recordRun(
            'business-1',
            revenue,
            analysis as any,
        );

        expect(tx.aiDecision.createMany).toHaveBeenCalledWith({
            data: expect.arrayContaining([
                expect.objectContaining({
                    aiRunId: 'run-1',
                    invoiceId: 'invoice-1',
                    policyStatus: 'ELIGIBLE_NOT_EXECUTED',
                }),
                expect.objectContaining({
                    aiRunId: 'run-1',
                    invoiceId: 'invoice-2',
                    policyStatus: 'ELIGIBLE_NOT_EXECUTED',
                }),
            ]),
        });
    });

    it('rejects an AI recovery estimate greater than the outstanding balance', async () => {
        const invalidAnalysis = {
            ...analysis,
            decisions: [
                {
                    ...analysis.decisions[0],
                    estimatedRecovery: 61,
                },
                analysis.decisions[1],
            ],
        };

        await expect(
            service.recordRun(
                'business-1',
                revenue,
                invalidAnalysis as any,
            ),
        ).rejects.toThrow(BadRequestException);

        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects an AI decision for an unknown invoice', async () => {
        const invalidAnalysis = {
            ...analysis,
            decisions: [
                {
                    ...analysis.decisions[0],
                    invoiceId: 'unknown-invoice',
                },
            ],
        };

        await expect(
            service.recordRun(
                'business-1',
                revenue,
                invalidAnalysis as any,
            ),
        ).rejects.toThrow('No revenue opportunity found');

        expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects negative recovery estimates', async () => {
        const invalidAnalysis = {
            ...analysis,
            decisions: [
                {
                    ...analysis.decisions[0],
                    estimatedRecovery: -1,
                },
            ],
        };

        await expect(
            service.recordRun(
                'business-1',
                revenue,
                invalidAnalysis as any,
            ),
        ).rejects.toThrow(BadRequestException);

        expect(prisma.$transaction).not.toHaveBeenCalled();
    });
});
