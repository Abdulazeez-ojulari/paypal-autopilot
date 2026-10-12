import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PaypalModule } from './modules/paypal/paypal.module';
import { PrismaModule } from './prisma.module';
import { RevenueModule } from './modules/revenue/revenue.module';
import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { ApprovalsModule } from './modules/approvals/approvals.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HttpModule,

    PrismaModule,

    PaypalModule,
    RevenueModule,
    AiModule,
    AuthModule,
    ApprovalsModule,
  ],
})
export class AppModule {}