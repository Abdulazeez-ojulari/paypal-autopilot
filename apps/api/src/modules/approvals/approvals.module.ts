import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BusinessMembershipGuard } from '../auth/guards/business-membership.guard';
import { ExecutionService } from './execution.service';

@Module({
    imports: [
        PrismaModule,
        AuthModule,
    ],
    controllers: [ApprovalsController],
    providers: [
        ApprovalsService,
        ExecutionService,
        JwtAuthGuard,
        BusinessMembershipGuard,
    ],
})
export class ApprovalsModule {}