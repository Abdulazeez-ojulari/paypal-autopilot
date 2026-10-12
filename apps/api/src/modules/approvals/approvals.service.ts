import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { RejectApprovalDto } from './dto/reject-approval.dto';

@Injectable()
export class ApprovalsService {
    constructor(private readonly prisma: PrismaService) {}

    private async ensureApprover(
        userId: string,
        businessId: string,
    ): Promise<void> {
        const membership = await this.prisma.businessMembership.findUnique({
            where: {
                userId_businessId: { userId, businessId },
            },
            select: { role: true },
        });

        if (!membership) {
            throw new ForbiddenException('You do not belong to this business.');
        }

        if (!['OWNER', 'ADMIN'].includes(membership.role)) {
            throw new ForbiddenException('Only business owners and administrators can decide approvals.');
        }
    }

    async initializePendingApprovals(
        userId: string,
        businessId: string,
    ) {
        await this.ensureApprover(userId, businessId);

        const decisions = await this.prisma.aiDecision.findMany({
            where: {
                requiresApproval: true,
                policyStatus: 'REQUIRES_HUMAN_APPROVAL',
                run: { businessId },
            },
            select: { id: true },
        });

        if (decisions.length > 0) {
            await this.prisma.humanApproval.createMany({
                data: decisions.map((decision) => ({
                    businessId,
                    decisionId: decision.id,
                })),
                skipDuplicates: true,
            });
        }

        return this.listPending(userId, businessId);
    }

    async listPending(userId: string, businessId: string) {
        await this.ensureApprover(userId, businessId);

        return this.prisma.humanApproval.findMany({
            where: { businessId, status: 'PENDING' },
            include: {
                decision: {
                    include: { run: true },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
    }

    async approve(
        userId: string,
        businessId: string,
        approvalId: string,
    ) {
        await this.ensureApprover(userId, businessId);

        return this.prisma.$transaction(async (tx) => {
            const approval = await tx.humanApproval.findFirst({
                where: { id: approvalId, businessId },
                include: { decision: true },
            });

            if (!approval) {
                throw new NotFoundException('Approval request not found.');
            }

            if (approval.status !== 'PENDING') {
                throw new BadRequestException(`This approval has already been ${approval.status.toLowerCase()}.`);
            }

            if (
                !approval.decision.requiresApproval || approval.decision.policyStatus !== 'REQUIRES_HUMAN_APPROVAL'
            ) {
                throw new BadRequestException('The decision is no longer eligible for this approval workflow.');
            }

            return tx.humanApproval.update({
                where: { id: approval.id },
                data: {
                    status: 'APPROVED',
                    decidedByUserId: userId,
                    decidedAt: new Date(),
                },
            });
        });
    }

    async reject(
        userId: string,
        businessId: string,
        approvalId: string,
        dto: RejectApprovalDto,
    ) {
        await this.ensureApprover(userId, businessId);

        const approval = await this.prisma.humanApproval.findFirst({
            where: { id: approvalId, businessId },
            select: { id: true, status: true },
        });

        if (!approval) {
            throw new NotFoundException('Approval request not found.');
        }

        if (approval.status !== 'PENDING') {
            throw new BadRequestException(`This approval has already been ${approval.status.toLowerCase()}.`);
        }

        return this.prisma.humanApproval.update({
            where: { id: approval.id },
            data: {
                status: 'REJECTED',
                decidedByUserId: userId,
                decidedAt: new Date(),
                rejectionReason: dto.reason.trim(),
            },
        });
    }
}