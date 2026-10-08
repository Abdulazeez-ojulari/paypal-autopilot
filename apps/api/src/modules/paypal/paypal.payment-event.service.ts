import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

interface RecordPaymentEventInput {
    paypalOrderId?: string;
    paypalCaptureId?: string;
    source: string;
    eventType: string;
    previousStatus?: string;
    newStatus?: string;
    metadata?: unknown;
}

@Injectable()
export class PaypalPaymentEventService {
    constructor(
        private readonly prisma: PrismaService,
    ) {}

    async record(
        input: RecordPaymentEventInput,
    ) {
        return this.prisma.paypalPaymentEvent.create({
            data: {
                paypalOrderId: input.paypalOrderId ?? null,
                paypalCaptureId: input.paypalCaptureId ?? null,
                source: input.source,
                eventType: input.eventType,
                previousStatus: input.previousStatus ?? null,
                newStatus: input.newStatus ?? null,
                metadata: input.metadata ?? undefined,
            },
        });
    }
}