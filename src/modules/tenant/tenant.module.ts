import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantRepository } from './tenant.repository';
import { StoreController } from './store.controller';

@Module({
  controllers: [StoreController],
  providers: [TenantService, TenantRepository],
  exports: [TenantService],
})
export class TenantModule {}
