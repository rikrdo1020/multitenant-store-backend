import { Injectable } from '@nestjs/common';
import { PlanType } from '@prisma/client';

export type FeatureName =
  | 'whatsappAuto'
  | 'yappyIntegrated'
  | 'analyticsAdvanced'
  | 'multiUser'
  | 'stockAdvanced'
  | 'emailsAuto'
  | 'orderTracking'
  | 'customDomain'
  | 'removeBranding';

const PLAN_FEATURES: Record<PlanType, Set<FeatureName>> = {
  FREE: new Set<FeatureName>(['orderTracking']),
  PRO: new Set<FeatureName>([
    'whatsappAuto',
    'yappyIntegrated',
    'analyticsAdvanced',
    'multiUser',
    'stockAdvanced',
    'emailsAuto',
    'orderTracking',
    'customDomain',
    'removeBranding',
  ]),
};

@Injectable()
export class PlanFeatureService {
  getEnabledFeatures(plan: PlanType): FeatureName[] {
    return Array.from(PLAN_FEATURES[plan] ?? []);
  }

  isFeatureEnabled(plan: PlanType, feature: FeatureName): boolean {
    return PLAN_FEATURES[plan]?.has(feature) ?? false;
  }
}
