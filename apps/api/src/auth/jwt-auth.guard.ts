import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { TokenService } from "./token.service";

interface AuthedRequest {
  headers: Record<string, string | undefined>;
  user?: { sub: string; role: string };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly tokens: TokenService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }
    try {
      req.user = this.tokens.verifyAccess(header.slice("Bearer ".length));
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
