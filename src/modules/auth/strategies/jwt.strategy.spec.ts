import { UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtStrategy, JwtPayload } from './jwt.strategy';

describe('JwtStrategy token version', () => {
  const config = {
    get: vi.fn((key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'access-secret';
      return undefined;
    }),
  };
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    tenantMember: {
      findUnique: vi.fn(),
    },
  };
  const strategy = new JwtStrategy(config as any, prisma as any);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      tokenVersion: 2,
    });
  });

  it('GIVEN an outdated access token WHEN validating SHOULD reject it', async () => {
    await expect(strategy.validate({} as any, payload({ tokenVersion: 1 }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('GIVEN a current access token WHEN validating SHOULD accept it', async () => {
    const result = await strategy.validate({} as any, payload({ tokenVersion: 2 }));

    expect(result).toMatchObject({ sub: 'user-1', tokenVersion: 2 });
  });

  it('GIVEN a legacy token and untouched user WHEN validating SHOULD accept version zero', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      tokenVersion: 0,
    });

    const result = await strategy.validate({} as any, payload({ tokenVersion: undefined }));

    expect(result).toMatchObject({ sub: 'user-1' });
  });
});

function payload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: 'user-1',
    email: 'user@example.com',
    role: UserRole.admin,
    type: 'access',
    ...overrides,
  };
}
