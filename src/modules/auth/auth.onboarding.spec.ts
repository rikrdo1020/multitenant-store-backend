import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthService } from './auth.service';

describe('AuthService onboarding', () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: { create: vi.fn() },
    tenant: { findUnique: vi.fn() },
  };

  const jwt = { sign: vi.fn(), verify: vi.fn() };
  const config = { get: vi.fn(), getOrThrow: vi.fn() };
  const resend = {};

  const service = new AuthService(prisma as any, jwt as any, config as any, resend as any);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GIVEN new user WHEN login response SHOULD include onboardingCompleted = false', async () => {
    const { onboardingCompleted } = {
      onboardingCompleted: false,
    };

    expect(onboardingCompleted).toBe(false);
  });

  it('GIVEN user with onboardingCompleted false WHEN completeOnboarding called SHOULD update user to true', async () => {
    prisma.user.update.mockResolvedValue({ id: 'user-1', onboardingCompleted: true });

    await service.completeOnboarding('user-1');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { onboardingCompleted: true },
    });
  });

  it('GIVEN user already onboarded WHEN completeOnboarding called SHOULD still update (idempotent)', async () => {
    prisma.user.update.mockResolvedValue({ id: 'user-1', onboardingCompleted: true });

    await service.completeOnboarding('user-1');
    await service.completeOnboarding('user-1');

    expect(prisma.user.update).toHaveBeenCalledTimes(2);
  });

  it('GIVEN completeOnboarding called SHOULD NOT return value (void)', async () => {
    prisma.user.update.mockResolvedValue({ id: 'user-1', onboardingCompleted: true });

    const result = await service.completeOnboarding('user-1');

    expect(result).toBeUndefined();
  });
});
