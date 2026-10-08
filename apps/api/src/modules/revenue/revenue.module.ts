import { Module } from "@nestjs/common";
import { PrismaModule } from "src/prisma.module";
import { RevenueController } from "./revenue.controller";
import { RevenueOpportunityService } from "./revenue-opportunity.service";

@Module({
    imports: [
        PrismaModule,
    ],

    controllers: [
        RevenueController,
    ],

    providers: [
        RevenueOpportunityService,
    ],

    exports: [
        RevenueOpportunityService,
    ],
})
export class RevenueModule {}