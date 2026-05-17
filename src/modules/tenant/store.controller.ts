import { Controller, Get } from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { Public } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { serialize } from '../../common/utils/serializer';

@Controller('store')
export class StoreController {
  @Public()
  @Get('profile')
  profile(@CurrentTenant() tenant: Tenant) {
    return serialize(tenant);
  }
}
