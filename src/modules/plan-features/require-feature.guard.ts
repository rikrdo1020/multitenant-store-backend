import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PlanType } from '@prisma/client';
import { Request } from 'express';
import { FeatureName, PlanFeatureService } from './plan-features.service';

export const FEATURE_KEY = 'required_feature';

export const RequireFeature = (feature: FeatureName) => SetMetadata(FEATURE_KEY, feature);

@Injectable()
export class RequireFeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly planFeatureService: PlanFeatureService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const feature = this.reflector.getAllAndOverride<FeatureName>(FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!feature) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const plan = (request.tenant?.plan ?? PlanType.FREE) as PlanType;

    if (!this.planFeatureService.isFeatureEnabled(plan, feature)) {
      throw new ForbiddenException({
        code: 'FEATURE_NOT_AVAILABLE',
        message: `Feature '${feature}' is not available on the ${plan} plan`,
      });
    }

    return true;
  }
}
