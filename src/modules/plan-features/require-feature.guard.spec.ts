import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlanType } from '@prisma/client';
import { RequireFeatureGuard, FEATURE_KEY } from './require-feature.guard';
import { PlanFeatureService } from './plan-features.service';

const makeContext = (plan: PlanType | undefined, feature: string | undefined): ExecutionContext => {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(feature) } as unknown as Reflector;
  const request = { tenant: plan ? { plan } : undefined };

  const ctx = {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: vi.fn().mockReturnValue({ getRequest: vi.fn().mockReturnValue(request) }),
  } as unknown as ExecutionContext;

  return { ...ctx, _reflector: reflector } as unknown as ExecutionContext;
};

describe('RequireFeatureGuard', () => {
  let guard: RequireFeatureGuard;
  let reflector: Reflector;
  let planFeatureService: PlanFeatureService;

  beforeEach(() => {
    reflector = { getAllAndOverride: vi.fn() } as unknown as Reflector;
    planFeatureService = new PlanFeatureService();
    guard = new RequireFeatureGuard(reflector, planFeatureService);
  });

  const makeCtx = (plan: PlanType | undefined, request?: object): ExecutionContext => {
    const req = request ?? { tenant: plan ? { plan } : undefined };
    return {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({ getRequest: vi.fn().mockReturnValue(req) }),
    } as unknown as ExecutionContext;
  };

  it('GIVEN no @RequireFeature decorator SHOULD allow through', () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(undefined);
    const ctx = makeCtx(PlanType.FREE);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('GIVEN PRO tenant + PRO-only feature SHOULD allow through', () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue('whatsappAuto');
    const ctx = makeCtx(PlanType.PRO);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('GIVEN FREE tenant + PRO-only feature SHOULD throw ForbiddenException', () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue('whatsappAuto');
    const ctx = makeCtx(PlanType.FREE);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('GIVEN FREE tenant + PRO-only feature SHOULD include feature name in error', () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue('analyticsAdvanced');
    const ctx = makeCtx(PlanType.FREE);

    try {
      guard.canActivate(ctx);
      expect.fail('should have thrown');
    } catch (e) {
      expect((e as ForbiddenException).getResponse()).toMatchObject({
        code: 'FEATURE_NOT_AVAILABLE',
        message: expect.stringContaining('analyticsAdvanced'),
      });
    }
  });

  it('GIVEN FREE tenant + orderTracking (free feature) SHOULD allow through', () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue('orderTracking');
    const ctx = makeCtx(PlanType.FREE);

    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('GIVEN no tenant in request SHOULD default to FREE and block PRO features', () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue('customDomain');
    const ctx = makeCtx(undefined);

    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
  });

  it('GIVEN reflector called with FEATURE_KEY SHOULD use correct metadata key', () => {
    vi.mocked(reflector.getAllAndOverride).mockReturnValue(undefined);
    const ctx = makeCtx(PlanType.PRO);

    guard.canActivate(ctx);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      FEATURE_KEY,
      expect.any(Array),
    );
  });
});
