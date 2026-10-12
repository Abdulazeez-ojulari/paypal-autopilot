import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';
import { AuthenticatedUser } from './jwt-auth.guard';

@Injectable()
export class BusinessMembershipGuard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<{
            params: { businessId?: string };
            user?: AuthenticatedUser;
        }>();

        const user = request.user;
        const businessId = request.params.businessId;

        if (!user?.sub) {
            throw new UnauthorizedException('Authentication is required.');
        }

        if (!businessId) {
            throw new ForbiddenException('A business ID is required.');
        }

        const membership = await this.prisma.businessMembership.findUnique({
            where: {
                userId_businessId: {
                    userId: user.sub,
                    businessId,
                },
            },
            select: { id: true },
        });

        if (!membership) {
            throw new ForbiddenException('You do not have access to this business.');
        }

        return true;
    }
}