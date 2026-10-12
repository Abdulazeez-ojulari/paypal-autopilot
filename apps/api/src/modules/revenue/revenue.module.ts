import { Module } from "@nestjs/common";
import { PrismaModule } from "src/prisma.module";
import { RevenueController } from "./revenue.controller";
import { RevenueOpportunityService } from "./revenue-opportunity.service";
import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { BusinessMembershipGuard } from "../auth/guards/business-membership.guard";

@Module({
    imports: [
        PrismaModule,
        AuthModule,
    ],

    controllers: [
        RevenueController,
    ],

    providers: [
        RevenueOpportunityService,
        JwtAuthGuard,
        BusinessMembershipGuard,
    ],

    exports: [
        RevenueOpportunityService,
    ],
})
export class RevenueModule {}