import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { ResendService } from '../../lib/resend/resend.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';
import { UserRole } from '@prisma/client';
import { JwtPayload } from './strategies/jwt.strategy';
import * as crypto from 'crypto';

const BCRYPT_ROUNDS = 12;

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
      // Prevent user enumeration — always hash even on miss
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

    // Derive the highest role across all tenants (superadmin wins)
    const role = this.deriveHighestRole(user.tenants.map((t) => t.role));
    const primaryTenantId = user.tenants[0]?.tenantId;

    const [accessToken, refreshToken, rawTenant] = await Promise.all([
      this.signAccessToken(user.id, user.email, role, primaryTenantId),
      this.signAndStoreRefreshToken(user.id),
      primaryTenantId
        ? this.prisma.tenant.findUnique({
            where: { id: primaryTenantId },
            select: { id: true, slug: true, name: true, logo: true, description: true, primaryColor: true },
          })
        : Promise.resolve(null),
    ]);

    const tenant = rawTenant
      ? { documentId: rawTenant.id, slug: rawTenant.slug, name: rawTenant.name, logo: rawTenant.logo, description: rawTenant.description, primaryColor: rawTenant.primaryColor }
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

    const role = this.deriveHighestRole(user.tenants.map((t) => t.role));
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
    // Do not reveal whether the email exists
    if (!user) return;

    // We reuse RefreshToken table with a short TTL as a password-reset token store
    const resetToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(resetToken);

    await this.prisma.refreshToken.create({
      data: {
        tokenHash,
        userId: user.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      },
    });

    const frontendUrl = this.config.get<string>('FRONTEND_URL');
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    await this.resend.sendPasswordReset(email, resetUrl).catch((err) => {
      this.logger.error(`Failed to send password reset email to ${email}`, err);
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.expiresAt < new Date()) {
      throw new BadRequestException({ code: 'INVALID_RESET_TOKEN', message: 'Reset token is invalid or expired' });
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: stored.userId },
        data: { passwordHash },
      }),
      this.prisma.refreshToken.delete({ where: { id: stored.id } }),
      // Revoke all other refresh tokens on password change
      this.prisma.refreshToken.deleteMany({ where: { userId: stored.userId } }),
    ]);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private signAccessToken(
    sub: string,
    email: string,
    role: UserRole,
    tenantId?: string,
  ): string {
    const payload: Omit<JwtPayload, 'iat' | 'exp'> = {
      sub,
      email,
      role,
      tenantId,
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

  private deriveHighestRole(roles: UserRole[]): UserRole {
    if (roles.includes(UserRole.superadmin)) return UserRole.superadmin;
    if (roles.includes(UserRole.admin)) return UserRole.admin;
    if (roles.includes(UserRole.manager)) return UserRole.manager;
    return UserRole.admin;
  }
}
