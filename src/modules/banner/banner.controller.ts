import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Tenant, UserRole } from '@prisma/client';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { BannerService } from './banner.service';
import { CreateStoreBannerDto } from './dto/create-store-banner.dto';
import { UpdateStoreBannerDto } from './dto/update-store-banner.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.superadmin)
@Controller('banners')
export class BannerController {
  constructor(private readonly bannerService: BannerService) {}

  @Get()
  findAll(@CurrentTenant() tenant: Tenant) {
    return this.bannerService.findAll(tenant.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateStoreBannerDto) {
    return this.bannerService.create(tenant.id, dto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @CurrentTenant() tenant: Tenant,
    @Body() dto: UpdateStoreBannerDto,
  ) {
    return this.bannerService.update(id, tenant.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentTenant() tenant: Tenant) {
    return this.bannerService.remove(id, tenant.id);
  }
}
