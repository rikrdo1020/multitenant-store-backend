import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { Public } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { serialize } from '../../common/utils/serializer';
import { TenantService } from './tenant.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Controller('store')
export class StoreController {
  constructor(private readonly tenantService: TenantService) {}

  @Public()
  @Get('profile')
  profile(@CurrentTenant() tenant: Tenant) {
    return serialize(tenant);
  }

  @Public()
  @Get('check-slug')
  checkSlug(
    @Query('slug') slug: string,
    @Query('excludeId') excludeId?: string,
  ) {
    return this.tenantService.checkSlug(slug, excludeId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-stores')
  myStores(@CurrentUser() user: { sub: string }) {
    return this.tenantService.findByOwner(user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Put('profile/:documentId')
  updateProfile(
    @Param('documentId') documentId: string,
    @CurrentUser() user: { sub: string },
    @Body() dto: UpdateTenantDto,
  ) {
    return this.tenantService.updateProfile(documentId, user.sub, dto);
  }
}
