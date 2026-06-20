import { Module } from '@nestjs/common';
import { TenantService } from './tenant.service';
import { TenantRepository } from './tenant.repository';
import { StoreController } from './store.controller';
import { StoreHomeRepository } from './store-home.repository';
import { StoreHomeService } from './store-home.service';

@Module({
  controllers: [StoreController],
  providers: [
    TenantService,
    TenantRepository,
    StoreHomeService,
    StoreHomeRepository,
  ],
  exports: [TenantService],
})
export class TenantModule {}
