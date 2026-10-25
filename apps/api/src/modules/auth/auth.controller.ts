import { Body, Controller, Get, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthenticatedUser, JwtAuthGuard } from './guards/jwt-auth.guard';

const ACCESS_COOKIE = 'pa_access_token';
const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000;

type AuthenticatedRequest = Request & {
  user: AuthenticatedUser;
};

@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    private cookieOptions() {
        return {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax' as const,
            path: '/',
            maxAge: ACCESS_TOKEN_MAX_AGE,
        };
    }

    private setAccessCookie(response: Response, token: string) {
        response.cookie(ACCESS_COOKIE, token, this.cookieOptions());
    }

    private validateBrowserOrigin(request: Request) {
        const origin = request.headers.origin;

        // Requests from non-browser clients may omit Origin.
        if (!origin) return;

        const expectedOrigin = (process.env.FRONTEND_URL ?? 'http://localhost:3001').replace(/\/+$/, '');

        if (
            origin.replace(/\/+$/, '') !== expectedOrigin ||
            request.headers['x-requested-with'] !== 'XMLHttpRequest'
        ) {
            throw new UnauthorizedException('Invalid request origin.');
        }
    }

    @Post('register')
    async register(
        @Body() dto: RegisterDto,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ) {
        this.validateBrowserOrigin(request);

        const result = await this.authService.register(dto);
        this.setAccessCookie(response, result.accessToken);

        const { accessToken: _accessToken, ...publicResult } = result;
        return publicResult;
    }

    @Post('login')
    async login(
        @Body() dto: LoginDto,
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ) {
        this.validateBrowserOrigin(request);

        const result = await this.authService.login(dto);
        this.setAccessCookie(response, result.accessToken);

        const { accessToken: _accessToken, ...publicResult } = result;
        return publicResult;
    }

    @Get('me')
    @UseGuards(JwtAuthGuard)
    me(@Req() request: AuthenticatedRequest) {
        return {
            id: request.user.sub,
            email: request.user.email,
        };
    }

    @Post('logout')
    logout(
        @Req() request: Request,
        @Res({ passthrough: true }) response: Response,
    ) {
        this.validateBrowserOrigin(request);

        response.clearCookie(ACCESS_COOKIE, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            path: '/',
        });

        return { success: true };
    }
}