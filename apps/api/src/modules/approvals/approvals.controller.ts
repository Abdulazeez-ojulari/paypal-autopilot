import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BusinessMembershipGuard } from '../auth/guards/business-membership.guard';
import { ApprovalsService } from './approvals.service';
import { RejectApprovalDto } from './dto/reject-approval.dto';

@Controller('approvals/businesses/:businessId')
@UseGuards(JwtAuthGuard, BusinessMembershipGuard)
export class ApprovalsController {
    constructor(private readonly approvalsService: ApprovalsService) {}

    @Post('initialize')
    initialize(
        @Req() req: any,
        @Param('businessId') businessId: string,
    ) {
        return this.approvalsService.initializePendingApprovals(req.user.sub, businessId);
    }

    @Get('pending')
    listPending(
        @Req() req: any,
        @Param('businessId') businessId: string,
    ) {
        return this.approvalsService.listPending(req.user.sub, businessId);
    }

    @Post(':approvalId/approve')
    approve(
        @Req() req: any,
        @Param('businessId') businessId: string,
        @Param('approvalId') approvalId: string,
    ) {
        return this.approvalsService.approve(req.user.sub, businessId, approvalId);
    }

    @Post(':approvalId/reject')
    reject(
        @Req() req: any,
        @Param('businessId') businessId: string,
        @Param('approvalId') approvalId: string,
        @Body() dto: RejectApprovalDto,
    ) {
        return this.approvalsService.reject(req.user.sub, businessId, approvalId, dto);
    }
}