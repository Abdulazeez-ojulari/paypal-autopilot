import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface AuthenticatedUser {
    sub: string;
    email: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(private readonly jwtService: JwtService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest<{
            headers: { authorization?: string };
            user?: AuthenticatedUser;
        }>();

        const authorization = request.headers.authorization;
        const [scheme, token] = authorization?.split(' ') ?? [];

        if (scheme !== 'Bearer' || !token) {
            throw new UnauthorizedException('A valid bearer token is required.');
        }

        try {
            const payload = await this.jwtService.verifyAsync<AuthenticatedUser>(token);

            if (
                typeof payload.sub !== 'string' || typeof payload.email !== 'string'
            ) {
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