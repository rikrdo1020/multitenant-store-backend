import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

describe('AuthService login roles', () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    tenant: {
      findUnique: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
  };

  const jwt = {
    sign: vi.fn(),
    verify: vi.fn(),
  };

  const config = {
    get: vi.fn((key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'access-secret';
      if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
      return undefined;
    }),
  };

  const resend = {};
  const service = new AuthService(prisma as any, jwt as any, config as any, resend as any);

  beforeEach(() => {
    vi.clearAllMocks();
    jwt.sign.mockImplementation((payload: { type: string; role?: UserRole }) =>
      `${payload.type}-${payload.role ?? 'refresh'}`,
    );
    prisma.refreshToken.create.mockResolvedValue({});
    prisma.refreshToken.delete.mockResolvedValue({});
  });

  it('GIVEN a platform superadmin without tenant membership WHEN logging in SHOULD issue a superadmin token', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-superadmin',
      email: 'superadmin@example.com',
      name: 'Super Admin',
      passwordHash: await bcrypt.hash('secure-password', 4),
      role: UserRole.superadmin,
      isActive: true,
      onboardingCompleted: true,
      tenants: [],
    });

    const result = await service.login({
      email: 'superadmin@example.com',
      password: 'secure-password',
    });

    expect(result.user.role).toBe(UserRole.superadmin);
    expect(result.tenant).toBeNull();
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'user-superadmin',
        role: UserRole.superadmin,
        tenantId: undefined,
        type: 'access',
      }),
      expect.any(Object),
    );
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('GIVEN a tenant admin with global manager role WHEN logging in SHOULD issue the tenant admin role', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-admin',
      email: 'admin@example.com',
      name: 'Store Admin',
      passwordHash: await bcrypt.hash('secure-password', 4),
      role: UserRole.manager,
      isActive: true,
      onboardingCompleted: false,
      tenants: [{ role: UserRole.admin, tenantId: 'tenant-1' }],
    });
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1',
      slug: 'demo-store',
      name: 'Demo Store',
      logo: null,
      description: null,
      primaryColor: '#000000',
    });

    const result = await service.login({
      email: 'admin@example.com',
      password: 'secure-password',
    });

    expect(result.user.role).toBe(UserRole.admin);
    expect(result.user.onboardingCompleted).toBe(false);
    expect(result.tenant).toMatchObject({
      documentId: 'tenant-1',
      slug: 'demo-store',
      name: 'Demo Store',
      plan: undefined,
    });
    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'user-admin',
        role: UserRole.admin,
        tenantId: 'tenant-1',
        type: 'access',
      }),
      expect.any(Object),
    );
  });

  it('GIVEN a platform superadmin refresh token WHEN refreshing SHOULD preserve the superadmin role', async () => {
    jwt.verify.mockReturnValue({ sub: 'user-superadmin', type: 'refresh', jti: 'refresh-1' });
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'stored-refresh',
      expiresAt: new Date(Date.now() + 60_000),
    });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-superadmin',
      email: 'superadmin@example.com',
      passwordHash: 'hash',
      role: UserRole.superadmin,
      isActive: true,
      onboardingCompleted: true,
      tenants: [],
    });

    await service.refresh('raw-refresh-token');

    expect(jwt.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        sub: 'user-superadmin',
        role: UserRole.superadmin,
        tenantId: undefined,
        type: 'access',
      }),
      expect.any(Object),
    );
  });
});
