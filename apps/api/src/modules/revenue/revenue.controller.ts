import { Controller, Get, Param, Post } from '@nestjs/common';
import { RevenueOpportunityService } from './revenue-opportunity.service';

@Controller('revenue')
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