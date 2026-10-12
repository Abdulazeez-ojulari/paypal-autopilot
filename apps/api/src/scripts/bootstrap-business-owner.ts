import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma.service';

async function bootstrap() {
    const app = await NestFactory.createApplicationContext(AppModule);

    try {
        const prisma = app.get(PrismaService);

        const businessId = process.env.TARGET_BUSINESS_ID;
        const email = process.env.OWNER_EMAIL?.trim().toLowerCase();

        if (!businessId || !email) {
            throw new Error('Set TARGET_BUSINESS_ID and OWNER_EMAIL before running this script.');
        }

        const [business, user] = await Promise.all([
            prisma.business.findUnique({
                where: { id: businessId },
                select: { id: true, name: true },
            }),
            prisma.user.findUnique({
                where: { email },
                select: { id: true, email: true },
            }),
        ]);

        if (!business) {
            throw new Error(`Business not found: ${businessId}`);
        }

        if (!user) {
            throw new Error(
                `User not found: ${email}. Register and log in first.`,
            );
        }

        const membership = await prisma.businessMembership.upsert({
            where: {
                userId_businessId: {
                    userId: user.id,
                    businessId: business.id,
                },
            },
            update: { role: 'OWNER' },
            create: {
                userId: user.id,
                businessId: business.id,
                role: 'OWNER',
            },
            select: {
                userId: true,
                businessId: true,
                role: true,
            },
        });

        console.log('Business owner membership confirmed:', {
            businessName: business.name,
            email: user.email,
            role: membership.role,
        });
    } finally {
        await app.close();
    }
}

bootstrap().catch(error => {
    console.error('Owner bootstrap failed:', error);
    process.exitCode = 1;
});