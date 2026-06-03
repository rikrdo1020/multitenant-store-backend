import { Module } from '@nestjs/common';
import { PlanFeatureService } from './plan-features.service';
import { PlanFeaturesController } from './plan-features.controller';
import { RequireFeatureGuard } from './require-feature.guard';

@Module({
  controllers: [PlanFeaturesController],
  providers: [PlanFeatureService, RequireFeatureGuard],
  exports: [PlanFeatureService, RequireFeatureGuard],
})
export class PlanFeaturesModule {}
