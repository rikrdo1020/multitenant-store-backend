import { describe, it, expect, beforeEach } from 'vitest';
import { PlanType } from '@prisma/client';
import { PlanFeatureService, FeatureName } from './plan-features.service';

describe('PlanFeatureService', () => {
  let service: PlanFeatureService;

  beforeEach(() => {
    service = new PlanFeatureService();
  });

  describe('getEnabledFeatures', () => {
    it('GIVEN FREE plan SHOULD return only orderTracking', () => {
      const features = service.getEnabledFeatures(PlanType.FREE);

      expect(features).toEqual(['orderTracking']);
    });

    it('GIVEN PRO plan SHOULD return all 9 features', () => {
      const features = service.getEnabledFeatures(PlanType.PRO);

      const expected: FeatureName[] = [
        'whatsappAuto',
        'yappyIntegrated',
        'analyticsAdvanced',
        'multiUser',
        'stockAdvanced',
        'emailsAuto',
        'orderTracking',
        'customDomain',
        'removeBranding',
      ];
      expect(features).toHaveLength(expected.length);
      expect(new Set(features)).toEqual(new Set(expected));
    });
  });

  describe('isFeatureEnabled', () => {
    it('GIVEN FREE plan + orderTracking SHOULD return true', () => {
      expect(service.isFeatureEnabled(PlanType.FREE, 'orderTracking')).toBe(true);
    });

    it('GIVEN FREE plan + whatsappAuto SHOULD return false', () => {
      expect(service.isFeatureEnabled(PlanType.FREE, 'whatsappAuto')).toBe(false);
    });

    it('GIVEN FREE plan + analyticsAdvanced SHOULD return false', () => {
      expect(service.isFeatureEnabled(PlanType.FREE, 'analyticsAdvanced')).toBe(false);
    });

    it('GIVEN FREE plan + multiUser SHOULD return false', () => {
      expect(service.isFeatureEnabled(PlanType.FREE, 'multiUser')).toBe(false);
    });

    it('GIVEN FREE plan + customDomain SHOULD return false', () => {
      expect(service.isFeatureEnabled(PlanType.FREE, 'customDomain')).toBe(false);
    });

    it('GIVEN FREE plan + removeBranding SHOULD return false', () => {
      expect(service.isFeatureEnabled(PlanType.FREE, 'removeBranding')).toBe(false);
    });

    it('GIVEN PRO plan + whatsappAuto SHOULD return true', () => {
      expect(service.isFeatureEnabled(PlanType.PRO, 'whatsappAuto')).toBe(true);
    });

    it('GIVEN PRO plan + yappyIntegrated SHOULD return true', () => {
      expect(service.isFeatureEnabled(PlanType.PRO, 'yappyIntegrated')).toBe(true);
    });

    it('GIVEN PRO plan + analyticsAdvanced SHOULD return true', () => {
      expect(service.isFeatureEnabled(PlanType.PRO, 'analyticsAdvanced')).toBe(true);
    });

    it('GIVEN PRO plan + customDomain SHOULD return true', () => {
      expect(service.isFeatureEnabled(PlanType.PRO, 'customDomain')).toBe(true);
    });

    it('GIVEN PRO plan + removeBranding SHOULD return true', () => {
      expect(service.isFeatureEnabled(PlanType.PRO, 'removeBranding')).toBe(true);
    });
  });

  describe('plan isolation', () => {
    it('FREE features SHOULD be a strict subset of PRO features', () => {
      const freeFeatures = service.getEnabledFeatures(PlanType.FREE);
      const proFeatures = new Set(service.getEnabledFeatures(PlanType.PRO));

      for (const f of freeFeatures) {
        expect(proFeatures.has(f)).toBe(true);
      }
    });

    it('PRO SHOULD have more features than FREE', () => {
      const free = service.getEnabledFeatures(PlanType.FREE);
      const pro = service.getEnabledFeatures(PlanType.PRO);

      expect(pro.length).toBeGreaterThan(free.length);
    });
  });
});
