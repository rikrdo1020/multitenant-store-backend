import { Controller, Get, UseGuards } from '@nestjs/common';
import { PlanType } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { PlanFeatureService } from './plan-features.service';

@UseGuards(JwtAuthGuard)
@Controller('plan-features')
export class PlanFeaturesController {
  constructor(private readonly planFeatureService: PlanFeatureService) {}

  @Get()
  getFeatures(@CurrentTenant() tenant: { plan: PlanType } | undefined) {
    const plan = tenant?.plan ?? PlanType.FREE;
    const features = this.planFeatureService.getEnabledFeatures(plan);
    return { plan, features };
  }
}
