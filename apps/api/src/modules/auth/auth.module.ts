import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaModule } from '../../prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { BusinessMembershipGuard } from './guards/business-membership.guard';

@Module({
    imports: [
        ConfigModule,
        PrismaModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                secret: config.getOrThrow<string>('JWT_SECRET'),
                signOptions: {
                    expiresIn: '15m'
                },
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [
        AuthService,
        JwtAuthGuard,
        BusinessMembershipGuard,
    ],
    exports: [
        AuthService,
        JwtModule,
        JwtAuthGuard,
        BusinessMembershipGuard,
    ],
})
export class AuthModule {}