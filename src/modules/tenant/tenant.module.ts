import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantRepository } from './tenant.repository';

@Module({
  providers: [TenantService, TenantRepository],
  exports: [TenantService],
})
export class TenantModule {}
