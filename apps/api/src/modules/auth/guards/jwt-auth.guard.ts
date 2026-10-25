import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

export interface AuthenticatedUser {
    sub: string;
    email: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<{
            method: string;
            headers: {
                authorization?: string;
                origin?: string;
                'x-requested-with'?: string;
            };
            cookies?: Record<string, string | undefined>;
            user?: AuthenticatedUser;
        }>();

        const authorization = request.headers.authorization;
        const [scheme, bearerToken] = authorization?.split(' ') ?? [];

        const cookieToken = request.cookies?.pa_access_token;
        const token =
        cookieToken || (scheme === 'Bearer' ? bearerToken : undefined);

        if (!token) {
            throw new UnauthorizedException('Authentication is required.');
        }

        // Protect cookie-authenticated mutations against cross-origin requests.
        if (cookieToken && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
            const origin = request.headers.origin;
            const expectedOrigin = (this.configService.get<string>('FRONTEND_URL') ?? 'http://localhost:3001' ).replace(/\/+$/, '');

            if (
                !origin ||
                origin.replace(/\/+$/, '') !== expectedOrigin ||
                request.headers['x-requested-with'] !== 'XMLHttpRequest'
            ) {
                throw new UnauthorizedException('Invalid request origin.');
            }
        }

        try {
            const payload = await this.jwtService.verifyAsync<AuthenticatedUser>(token);

            if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
                throw new UnauthorizedException('Invalid token payload.');
            }

            request.user = {
                sub: payload.sub,
                email: payload.email,
            };

            return true;
        } catch {
            throw new UnauthorizedException('Invalid or expired access token.');
        }
    }
}