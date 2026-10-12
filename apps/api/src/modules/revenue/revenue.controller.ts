import { Controller, Get, Param, Post } from '@nestjs/common';
import { RevenueOpportunityService } from './revenue-opportunity.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BusinessMembershipGuard } from '../auth/guards/business-membership.guard';

@Controller('revenue')
@UseGuards(JwtAuthGuard, BusinessMembershipGuard)
export class RevenueController {
  constructor(
    private readonly revenueService: RevenueOpportunityService,
  ) {}

  @Post('businesses/:businessId/analyze')
  async analyzeBusiness(
    @Param('businessId') businessId: string
  ) {
    return this.revenueService.analyzeBusiness(businessId);
  }

  @Get('businesses/:businessId/opportunities')
  async getOpportunities(
    @Param('businessId') businessId: string
  ) {
    return this.revenueService.getOpportunities(businessId);
  }
}