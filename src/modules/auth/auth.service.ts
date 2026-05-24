import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { ResendService } from '../../lib/resend/resend.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterInviteDto } from './dto/register-invite.dto';
import * as bcrypt from 'bcryptjs';
import { PlanType, UserRole } from '@prisma/client';
import { JwtPayload } from './strategies/jwt.strategy';
import * as crypto from 'crypto';

const BCRYPT_ROUNDS = 12;
const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly resend: ResendService,
  ) {}

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException({ code: 'EMAIL_TAKEN', message: 'Email is already registered' });
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        phone: dto.phone,
      },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    this.logger.log(`New user registered: ${user.email}`);
    return user;
  }

  // ---------------------------------------------------------------------------
  // Login
  // ---------------------------------------------------------------------------

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        tenants: { select: { role: true, tenantId: true } },
      },
    });

    if (!user) {
      // Prevent user enumeration - always hash even on miss.
      await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' });
    }

    if (!user.isActive) {
      throw new UnauthorizedException({ code: 'ACCOUNT_INACTIVE', message: 'Account is deactivated' });
    }

    const role = this.resolveEffectiveRole(user.role, user.tenants.map((t) => t.role));
    const primaryTenantId = user.tenants[0]?.tenantId;

    const [refreshToken, rawTenant] = await Promise.all([
      this.signAndStoreRefreshToken(user.id),
      primaryTenantId
        ? this.prisma.tenant.findUnique({
            where: { id: primaryTenantId },
            select: { id: true, slug: true, name: true, logo: true, description: true, primaryColor: true, plan: true },
          })
        : Promise.resolve(null),
    ]);

    const accessToken = this.signAccessToken(user.id, user.email, role, primaryTenantId, rawTenant?.plan);

    const tenant = rawTenant
      ? { documentId: rawTenant.id, slug: rawTenant.slug, name: rawTenant.name, logo: rawTenant.logo, description: rawTenant.description, primaryColor: rawTenant.primaryColor, plan: rawTenant.plan }
      : null;

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, name: user.name, role },
      tenant,
    };
  }

  // ---------------------------------------------------------------------------
  // Token refresh
  // ---------------------------------------------------------------------------

  async refresh(rawRefreshToken: string) {
    let payload: { sub: string; type: string; jti: string };

    try {
      payload = this.jwt.verify(rawRefreshToken, {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException({ code: 'INVALID_REFRESH_TOKEN', message: 'Refresh token is invalid or expired' });
    }

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException({ code: 'INVALID_TOKEN_TYPE', message: 'Not a refresh token' });
    }

    const tokenHash = this.hashToken(rawRefreshToken);

    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: 'REFRESH_TOKEN_REVOKED', message: 'Refresh token has been revoked or expired' });
    }

    // Rotate: delete old, issue new pair
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { tenants: { select: { role: true, tenantId: true } } },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException({ code: 'ACCOUNT_INACTIVE', message: 'Account inactive' });
    }

    const role = this.resolveEffectiveRole(user.role, user.tenants.map((t) => t.role));
    const primaryTenantId = user.tenants[0]?.tenantId;

    const [accessToken, newRefreshToken] = await Promise.all([
      this.signAccessToken(user.id, user.email, role, primaryTenantId),
      this.signAndStoreRefreshToken(user.id),
    ]);

    return { accessToken, refreshToken: newRefreshToken };
  }

  // ---------------------------------------------------------------------------
  // Logout
  // ---------------------------------------------------------------------------

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
  }

  // ---------------------------------------------------------------------------
  // Password reset
  // ---------------------------------------------------------------------------

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException({
        code: 'PASSWORD_RESET_EMAIL_NOT_FOUND',
        message: 'Email not found',
      });
    }

    const resetToken = crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashToken(resetToken);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          tokenHash,
          userId: user.id,
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      }),
    ]);

    const resetUrlBase = this.config.getOrThrow<string>('PASSWORD_RESET_URL');
    const resetUrl = this.buildUrlWithToken(resetUrlBase, resetToken);

    try {
      await this.resend.sendPasswordReset(email, resetUrl);
    } catch (error) {
      await this.invalidatePasswordResetToken(tokenHash);
      this.logger.error(
        `Password reset email delivery failed for ${email}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException({
        code: 'PASSWORD_RESET_EMAIL_DELIVERY_FAILED',
        message: 'Password reset email could not be sent',
      });
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const stored = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.usedAt) {
      throw this.invalidResetTokenException();
    }

    if (stored.expiresAt < new Date()) {
      throw new BadRequestException({
        code: 'EXPIRED_RESET_TOKEN',
        message: 'Reset token has expired',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const usedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: stored.id, usedAt: null },
        data: { usedAt },
      });

      if (claimed.count !== 1) {
        throw this.invalidResetTokenException();
      }

      await tx.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      });

      // Revoke active auth sessions on password change.
      await tx.refreshToken.deleteMany({ where: { userId: stored.userId } });
    });
  }

  // ---------------------------------------------------------------------------
  // Team invitation registration
  // ---------------------------------------------------------------------------

  async verifyInvite(token: string) {
    const invitation = await this.findUsableInvite(token);
    const existingUser = await this.prisma.user.findUnique({
      where: { email: invitation.email },
      select: { id: true },
    });

    return {
      email: invitation.email,
      role: invitation.role,
      isExistingUser: !!existingUser,
      expiresAt: invitation.expiresAt,
      tenant: {
        documentId: invitation.tenant.id,
        slug: invitation.tenant.slug,
        name: invitation.tenant.name,
        logo: invitation.tenant.logo,
        description: invitation.tenant.description,
        primaryColor: invitation.tenant.primaryColor,
      },
    };
  }

  async registerInvite(dto: RegisterInviteDto) {
    const invitation = await this.findUsableInvite(dto.token);
    const existingUser = await this.prisma.user.findUnique({
      where: { email: invitation.email },
      select: { id: true, isActive: true },
    });

    if (!existingUser && (!dto.name || !dto.password)) {
      throw new BadRequestException({
        code: 'INVITE_REGISTRATION_DETAILS_REQUIRED',
        message: 'Name and password are required for invited users without an existing account',
      });
    }

    const passwordHash = existingUser ? undefined : await bcrypt.hash(dto.password!, BCRYPT_ROUNDS);

    const result = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.memberInvitation.updateMany({
        where: { id: invitation.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      if (claimed.count !== 1) {
        throw this.invalidInviteTokenException();
      }

      let user = await tx.user.findUnique({
        where: { email: invitation.email },
        select: { id: true, email: true, name: true, isActive: true },
      });
      const usedExistingUser = !!user;

      if (user && !user.isActive) {
        throw new BadRequestException({
          code: 'INVITED_USER_INACTIVE',
          message: 'Invited user account is inactive',
        });
      }

      if (!user) {
        user = await tx.user.create({
          data: {
            email: invitation.email,
            name: dto.name,
            passwordHash: passwordHash!,
          },
          select: { id: true, email: true, name: true, isActive: true },
        });
      }

      const existingMember = await tx.tenantMember.findUnique({
        where: { userId_tenantId: { userId: user.id, tenantId: invitation.tenantId } },
      });
      if (existingMember) {
        throw new ConflictException({
          code: 'MEMBER_EXISTS',
          message: 'User is already a member of this tenant',
        });
      }

      await tx.tenantMember.create({
        data: {
          userId: user.id,
          tenantId: invitation.tenantId,
          role: invitation.role,
        },
      });

      return { user, usedExistingUser };
    });

    return {
      message: 'Invitation accepted.',
      existingUser: result.usedExistingUser,
      user: {
        documentId: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: invitation.role,
      },
      tenant: {
        documentId: invitation.tenant.id,
        slug: invitation.tenant.slug,
        name: invitation.tenant.name,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private signAccessToken(
    sub: string,
    email: string,
    role: UserRole,
    tenantId?: string,
    plan?: PlanType,
  ): string {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub,
      email,
      role,
      tenantId,
      plan,
      type: 'access',
    };
    return this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m',
    });
  }

  private async signAndStoreRefreshToken(userId: string): Promise<string> {
    const jti = crypto.randomUUID();
    const token = this.jwt.sign(
      { sub: userId, type: 'refresh', jti },
      {
        secret: this.config.get<string>('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d',
      },
    );

    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({ data: { tokenHash, userId, expiresAt } });

    return token;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private invalidResetTokenException(): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_RESET_TOKEN',
      message: 'Reset token is invalid',
    });
  }

  private invalidInviteTokenException(): BadRequestException {
    return new BadRequestException({
      code: 'INVALID_INVITE_TOKEN',
      message: 'Invitation token is invalid',
    });
  }

  private async findUsableInvite(token: string) {
    const tokenHash = this.hashToken(token);
    const invitation = await this.prisma.memberInvitation.findUnique({
      where: { tokenHash },
      include: {
        tenant: {
          select: {
            id: true,
            slug: true,
            name: true,
            logo: true,
            description: true,
            primaryColor: true,
          },
        },
      },
    });

    if (!invitation || invitation.usedAt) {
      throw this.invalidInviteTokenException();
    }

    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException({
        code: 'EXPIRED_INVITE_TOKEN',
        message: 'Invitation token has expired',
      });
    }

    return invitation;
  }

  private async invalidatePasswordResetToken(tokenHash: string): Promise<void> {
    try {
      await this.prisma.passwordResetToken.updateMany({
        where: { tokenHash, usedAt: null },
        data: { usedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(
        'Failed to invalidate password reset token after email delivery failure',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private buildUrlWithToken(baseUrl: string, token: string): string {
    const url = new URL(baseUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private deriveHighestRole(roles: UserRole[]): UserRole {
    if (roles.includes(UserRole.superadmin)) return UserRole.superadmin;
    if (roles.includes(UserRole.admin)) return UserRole.admin;
    if (roles.includes(UserRole.manager)) return UserRole.manager;
    return UserRole.manager;
  }

  private resolveEffectiveRole(userRole: UserRole, tenantRoles: UserRole[]): UserRole {
    if (userRole === UserRole.superadmin) return UserRole.superadmin;
    return this.deriveHighestRole(tenantRoles);
  }
}
