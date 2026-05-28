import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { PlanType, UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  tenantId?: string;
  tokenVersion?: number;
  plan?: PlanType;
  type: 'access';
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_ACCESS_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload): Promise<JwtPayload> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN_TYPE', message: 'Not an access token' });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, tokenVersion: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({ code: 'ACCOUNT_INACTIVE', message: 'Account is inactive or not found' });
    }

    if ((payload.tokenVersion ?? 0) !== user.tokenVersion) {
      throw new UnauthorizedException({ code: 'TOKEN_REVOKED', message: 'Access token has been revoked' });
    }

    const tenant = req.tenant;

    // No tenant in request (auth routes, superadmin panel, etc.) — pass through
    if (!tenant) {
      return payload;
    }

    // Superadmin users can access any tenant without a membership record
    if (payload.role === UserRole.superadmin) {
      return { ...payload, tenantId: tenant.id };
    }

    // For all other users, verify actual TenantMember record exists for this tenant
    const membership = await this.prisma.tenantMember.findUnique({
      where: { userId_tenantId: { userId: payload.sub, tenantId: tenant.id } },
      select: { role: true },
    });

    if (!membership) {
      throw new ForbiddenException({ code: 'NOT_A_TENANT_MEMBER', message: 'You are not a member of this tenant' });
    }

    // Override role with the actual role for this tenant (not the global JWT claim)
    return { ...payload, role: membership.role, tenantId: tenant.id };
  }
}
