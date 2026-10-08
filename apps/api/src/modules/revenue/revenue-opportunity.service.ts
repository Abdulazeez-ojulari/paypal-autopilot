import { Injectable, NotFoundException } from '@nestjs/common';
import { RevenueOpportunity } from 'generated/prisma/client';
import { PrismaService } from 'src/prisma.service';

type OpportunityDecision = {
    priority: string;
    recoveryRate: number;
    recommendedAction: string;
};

@Injectable()
export class RevenueOpportunityService {
    constructor(
        private readonly prisma: PrismaService,
    ) {}

    async analyzeBusiness(businessId: string) {
        const business = await this.prisma.business.findUnique({
            where: {
                id: businessId,
            },
        });

        if (!business) {
            throw new NotFoundException(`Business ${businessId} not found`);
        }

        const invoices = await this.prisma.invoice.findMany({
            where: {
                businessId,
                status: 'OVERDUE',
            },
            include: {
                customer: true,
            },
            orderBy: {
                dueAt: 'asc',
            },
        });

        const opportunities: RevenueOpportunity[] = [];

        for (const invoice of invoices) {
            const overdueDays = Math.max(
                0,
                Math.floor(
                    (Date.now() - invoice.dueAt.getTime()) / (1000 * 60 * 60 * 24),
                ),
            );

            const amount = Number(invoice.amount);
            const risk = invoice.customer.riskLevel;

            const decision = this.determineOpportunityDecision(
                amount,
                risk,
                overdueDays,
            );

            const estimatedRecovery = Number((amount * decision.recoveryRate).toFixed(2));

            const reason =
                `${overdueDays} days overdue; ` +
                `customer risk is ${risk}; ` +
                `outstanding amount is ${invoice.currencyCode} ${amount.toFixed(2)}.`;

            const opportunity = await this.prisma.revenueOpportunity.upsert({
                where: {
                    invoiceId_type: {
                        invoiceId: invoice.id,
                        type: 'OVERDUE_INVOICE',
                    },
                },

                update: {
                    priority: decision.priority,
                    reason,
                    outstandingAmount: amount,
                    estimatedRecovery,
                    confidence: decision.recoveryRate,
                    recommendedAction: decision.recommendedAction,
                    status: 'OPEN',
                },

                create: {
                    invoiceId: invoice.id,
                    type: 'OVERDUE_INVOICE',
                    priority: decision.priority,
                    reason,
                    outstandingAmount: amount,
                    estimatedRecovery,
                    confidence: decision.recoveryRate,
                    recommendedAction: decision.recommendedAction,
                    status: 'OPEN',
                },
            });

            opportunities.push(opportunity);
        }

        return this.buildSummary(
            businessId,
            opportunities,
        );
    }

    async getOpportunities(businessId: string) {
        const business = await this.prisma.business.findUnique({
            where: {
                id: businessId,
            },
        });

        if (!business) {
            throw new NotFoundException(`Business ${businessId} not found`);
        }

        const opportunities = await this.prisma.revenueOpportunity.findMany({
            where: {
                invoice: {
                    businessId,
                },
            },
            include: {
                invoice: {
                    include: {
                        customer: true,
                    },
                },
            },
            orderBy: [
                {
                    priority: 'desc',
                },
                {
                    estimatedRecovery: 'desc',
                },
            ],
        });

        return this.buildSummary(
            businessId,
            opportunities,
        );
    }

    private determineOpportunityDecision(
        amount: number,
        risk: string,
        overdueDays: number,
    ): OpportunityDecision {

        if (risk === 'LOW' && overdueDays <= 20) {
            return {
                priority: 'LOW',
                recoveryRate: 0.85,
                recommendedAction: 'SEND_PAYMENT_REMINDER'
            };
        }

        if (risk === 'HIGH' || amount >= 300) {
            return {
                priority: 'HIGH',
                recoveryRate: risk === 'HIGH' ? 0.45 : 0.65,
                recommendedAction: 'REVIEW_AND_SEND_PAYMENT_REQUEST',
            };
        }

        if (risk === 'MEDIUM') {
            return {
                priority: 'MEDIUM',
                recoveryRate: 0.70,
                recommendedAction: 'SEND_PAYMENT_REMINDER',
            };
        }

        return {
            priority: 'MEDIUM',
            recoveryRate: 0.65,
            recommendedAction: 'SEND_PAYMENT_REMINDER',
        };
    }

    private buildSummary(
        businessId: string,
        opportunities: RevenueOpportunity[],
    ) {
        const summary = opportunities.reduce(
            (result, opportunity) => {
                result.totalOutstanding += Number(opportunity.outstandingAmount);
                result.estimatedRecovery += Number(opportunity.estimatedRecovery);

                return result;
            },
            {
                totalOutstanding: 0,
                estimatedRecovery: 0,
            },
        );

        return {
            businessId,
            invoiceCount: opportunities.length,
            totalOutstanding: Number(summary.totalOutstanding.toFixed(2)),
            estimatedRecovery: Number(summary.estimatedRecovery.toFixed(2)),
            opportunities,
        };
    }
}

// @Injectable()
// export class RevenueOpportunityService {
//     constructor(
//         private readonly prisma: PrismaService,
//     ) {}

//     async analyzeBusiness(businessId: string) {
//         const invoices = await this.prisma.invoice.findMany({
//             where: {
//                 businessId,
//                 status: 'OVERDUE',
//             },
//             include: {
//                 customer: true,
//             },
//         });

//         const opportunities: RevenueOpportunity[] = [];

//         for (const invoice of invoices) {
//             const now = new Date();

//             const overdueDays =
//                 Math.floor(
//                     (now.getTime() - invoice.dueAt.getTime()) /
//                     (1000 * 60 * 60 * 24),
//                 );

//             const amount = Number(invoice.amount);
//             const risk = invoice.customer.riskLevel;

//             let priority = 'MEDIUM';
//             let recoveryRate = 0.65;

//             if (amount >= 300 || risk === 'HIGH') {
//                 priority = 'HIGH';
//             }

//             if (risk === 'LOW' && overdueDays <= 20) {
//                 priority = 'LOW';
//                 recoveryRate = 0.85;
//             }

//             if (risk === 'MEDIUM') {
//                 recoveryRate = 0.70;
//             }

//             if (risk === 'HIGH') {
//                 recoveryRate = 0.45;
//             }

//             const estimatedRecovery = Number((amount * recoveryRate).toFixed(2));
//             const recommendedAction = priority === 'HIGH' ? 'REVIEW_AND_SEND_PAYMENT_REQUEST' : 'SEND_PAYMENT_REMINDER';

//             const opportunity = await this.prisma.revenueOpportunity.upsert(
//                 {
//                     where: {
//                         invoiceId_type: {
//                             invoiceId: invoice.id,
//                             type: 'OVERDUE_INVOICE',
//                         },
//                     },

//                     update: {
//                         priority,
//                         outstandingAmount: amount,
//                         estimatedRecovery,
//                         confidence: recoveryRate,
//                         recommendedAction,
//                         reason: `${overdueDays} days overdue; customer risk is ${risk}.`,
//                         status: 'OPEN',
//                     },

//                     create: {
//                         invoiceId: invoice.id,
//                         type: 'OVERDUE_INVOICE',
//                         priority,
//                         reason: `${overdueDays} days overdue; customer risk is ${risk}.`,
//                         outstandingAmount: amount,
//                         estimatedRecovery,
//                         confidence: recoveryRate,
//                         recommendedAction,
//                         status: 'OPEN',
//                     },
//                 });

//             opportunities.push(opportunity);
//         }

//         const summary = opportunities.reduce(
//             (result, opportunity) => {
//                 result.totalOutstanding += Number(opportunity.outstandingAmount);
//                 result.estimatedRecovery += Number(opportunity.estimatedRecovery);
//                 return result;
//             },
//             {
//                 totalOutstanding: 0,
//                 estimatedRecovery: 0,
//             },
//         );

//         return {
//             businessId,
//             invoiceCount: opportunities.length,
//             totalOutstanding: Number(summary.totalOutstanding.toFixed(2)),
//             estimatedRecovery: Number(summary.estimatedRecovery.toFixed(2)),
//             opportunities,
//         };
//     }
// }