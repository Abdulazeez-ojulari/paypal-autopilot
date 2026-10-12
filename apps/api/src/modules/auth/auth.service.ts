import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { hash, compare } from 'bcryptjs';
import { PrismaService } from '../../prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) {}

    async register(dto: RegisterDto) {
        const email = dto.email.trim().toLowerCase();

        const existingUser = await this.prisma.user.findUnique({
            where: { email },
            select: { id: true },
        });

        if (existingUser) {
            throw new ConflictException('An account with this email already exists.');
        }

        const passwordHash = await hash(dto.password, 12);

        const result = await this.prisma.$transaction(async tx => {
            const user = await tx.user.create({
                data: {
                    email,
                    passwordHash,
                },
                select: {
                    id: true,
                    email: true,
                    createdAt: true,
                },
            });

            const business = await tx.business.create({
                data: {
                    name: dto.businessName.trim(),
                    memberships: {
                        create: {
                            userId: user.id,
                            role: 'OWNER',
                        },
                    },
                },
                select: {
                    id: true,
                    name: true,
                    currency: true,
                },
            });

            return { user, business };
        });

        const accessToken = await this.createAccessToken(result.user.id, result.user.email);

        return {
            accessToken,
            tokenType: 'Bearer',
            expiresIn: '15m',
            user: result.user,
            business: result.business,
        };
    }

    async login(dto: LoginDto) {
        const email = dto.email.trim().toLowerCase();

        const user = await this.prisma.user.findUnique({
            where: { email },
        });

        if (!user || !(await compare(dto.password, user.passwordHash))) {
            throw new UnauthorizedException('Invalid email or password.');
        }

        const memberships = await this.prisma.businessMembership.findMany({
            where: { userId: user.id },
            select: {
                role: true,
                business: {
                    select: {
                        id: true,
                        name: true,
                        currency: true,
                    },
                },
            },
        });

        const accessToken = await this.createAccessToken(user.id, user.email);

        return {
            accessToken,
            tokenType: 'Bearer',
            expiresIn: '15m',
            user: {
                id: user.id,
                email: user.email,
                createdAt: user.createdAt,
            },
            businesses: memberships.map(membership => ({
                ...membership.business,
                role: membership.role,
            })),
        };
    }

    private async createAccessToken(userId: string, email: string) {
        return this.jwtService.signAsync({
            sub: userId,
            email,
        });
    }
}