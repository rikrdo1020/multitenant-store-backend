import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { CreateShippingMethodDto } from './dto/create-shipping-method.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, Public } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { UserRole, Tenant } from '@prisma/client';

@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Public()
  @Get()
  findAll(@CurrentTenant() tenant: Tenant) {
    return this.shippingService.findAll(tenant.id);
  }

  @Public()
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentTenant() tenant: Tenant) {
    return this.shippingService.findById(id, tenant.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.superadmin)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateShippingMethodDto) {
    return this.shippingService.create(tenant.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.superadmin)
  @Put(':id')
  update(@Param('id') id: string, @CurrentTenant() tenant: Tenant, @Body() dto: CreateShippingMethodDto) {
    return this.shippingService.update(id, tenant.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.superadmin)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentTenant() tenant: Tenant) {
    return this.shippingService.remove(id, tenant.id);
  }
}
