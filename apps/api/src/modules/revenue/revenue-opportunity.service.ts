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

        const now = new Date();

        const invoices = await this.prisma.invoice.findMany({
            where: {
                businessId,
                status: {
                    in: ['OVERDUE', 'PARTIALLY_PAID'],
                },
            },
            include: {
                customer: true,
            },
            orderBy: {
                dueAt: 'asc',
            },
        });

        const opportunities: RevenueOpportunity[] = [];
        const eligibleInvoiceIds = new Set<string>();

        for (const invoice of invoices) {
            if (
                invoice.status === 'PARTIALLY_PAID' && invoice.dueAt.getTime() > now.getTime()
            ) {
                continue;
            }

            const amount = Number(invoice.amount);
            const paidAmount = Number(invoice.paidAmount ?? 0);

            if (
                !Number.isFinite(amount) || !Number.isFinite(paidAmount) ||
                amount <= 0 || paidAmount < 0
            ) {
                continue;
            }

            const outstandingAmount = Number(Math.max(0, amount - paidAmount).toFixed(2));

            if (outstandingAmount <= 0) {
                continue;
            }

            const overdueDays = Math.max(
                0,
                Math.floor((now.getTime() - invoice.dueAt.getTime()) / (1000 * 60 * 60 * 24))
            );
            const risk = invoice.customer.riskLevel;

            const decision = this.determineOpportunityDecision(
                outstandingAmount,
                risk,
                overdueDays,
            );

            const estimatedRecovery = Number((outstandingAmount * decision.recoveryRate).toFixed(2));

            const reason =
                `${overdueDays} days overdue; ` +
                `customer risk is ${risk}; ` +
                `original invoice amount is ${invoice.currencyCode} ${amount.toFixed(2)}; ` +
                `amount paid is ${invoice.currencyCode} ${paidAmount.toFixed(2)}; ` +
                `outstanding amount is ${invoice.currencyCode} ${outstandingAmount.toFixed(2)}.`;

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
                    outstandingAmount,
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
                    outstandingAmount,
                    estimatedRecovery,
                    confidence: decision.recoveryRate,
                    recommendedAction: decision.recommendedAction,
                    status: 'OPEN',
                },
            });

            eligibleInvoiceIds.add(invoice.id);
            opportunities.push(opportunity);
        }

        const existingOpenOpportunities =
            await this.prisma.revenueOpportunity.findMany({
                where: {
                    type: 'OVERDUE_INVOICE',
                    status: 'OPEN',
                    invoice: {
                        businessId,
                    },
                },
                select: {
                    id: true,
                    invoiceId: true,
                },
            });

        const staleOpportunityIds = existingOpenOpportunities
            .filter(
                (opportunity) => !eligibleInvoiceIds.has(opportunity.invoiceId),
            )
            .map((opportunity) => opportunity.id);

        if (staleOpportunityIds.length > 0) {
            await this.prisma.revenueOpportunity.updateMany({
                where: {
                    id: {
                        in: staleOpportunityIds,
                    },
                },
                data: {
                    status: 'CLOSED',
                    outstandingAmount: 0,
                    estimatedRecovery: 0,
                    reason: 'Closed because the invoice is no longer eligible for overdue recovery or has no outstanding balance.',
                },
            });
        }

        return this.buildSummary(businessId, opportunities);
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
                status: 'OPEN',
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

        return this.buildSummary(businessId, opportunities);
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