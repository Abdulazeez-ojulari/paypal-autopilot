import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma.module';
import { ApprovalsController } from './approvals.controller';
import { ApprovalsService } from './approvals.service';
import { AuthModule } from '../auth/auth.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BusinessMembershipGuard } from '../auth/guards/business-membership.guard';
import { ExecutionService } from './execution.service';
import { PaypalInvoicingService } from './paypal-invoicing.service';
import { PaypalModule } from '../paypal/paypal.module';

@Module({
    imports: [
        PrismaModule,
        AuthModule,
        PaypalModule,
    ],
    controllers: [ApprovalsController],
    providers: [
        ApprovalsService,
        ExecutionService,
        PaypalInvoicingService,
        JwtAuthGuard,
        BusinessMembershipGuard,
    ],
})
export class ApprovalsModule {}