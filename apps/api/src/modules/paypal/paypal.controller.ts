import { Body, Controller, Get, Param, Post, UsePipes, ValidationPipe } from '@nestjs/common';
import { PaypalService } from './paypal.service';
import { CreatePaypalOrderDto } from './dto/create-paypal-order.dto';

@Controller('paypal')
export class PaypalController {
    constructor(
        private readonly paypalService: PaypalService,
    ) {}

    @Post('orders')
    @UsePipes(
        new ValidationPipe({ whitelist: true, transform: true })
    )
    async createOrder(
        @Body() dto: CreatePaypalOrderDto,
    ) {
        return this.paypalService.createOrder(dto);
    }

    @Post('orders/:orderId/capture')
    async captureOrder(
        @Param('orderId') orderId: string,
    ) {
        return this.paypalService.captureOrder(orderId);
    }

    @Get('orders/:orderId')
    async getOrder(
        @Param('orderId') orderId: string
    ) {
        return this.paypalService.getOrder(orderId);
    }
}