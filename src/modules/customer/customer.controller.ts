import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthenticatedCustomerUser, CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { UpdateCurrentCustomerDto } from './dto/update-current-customer.dto';
import { UpdateCustomerAddressDto } from './dto/update-customer-address.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { UserRole, Tenant } from '@prisma/client';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

class CustomerQuery {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  pageSize?: number;
}

@Controller('customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @UseGuards(JwtAuthGuard)
  @Get('me')
  findCurrent(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthenticatedCustomerUser,
  ) {
    return this.customerService.findCurrent(tenant.id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me')
  updateCurrent(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthenticatedCustomerUser,
    @Body() dto: UpdateCurrentCustomerDto,
  ) {
    return this.customerService.updateCurrent(tenant.id, user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/addresses')
  findCurrentAddresses(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthenticatedCustomerUser,
  ) {
    return this.customerService.findCurrentAddresses(tenant.id, user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/addresses')
  @HttpCode(HttpStatus.CREATED)
  createCurrentAddress(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthenticatedCustomerUser,
    @Body() dto: CreateCustomerAddressDto,
  ) {
    return this.customerService.createCurrentAddress(tenant.id, user, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Put('me/addresses/:addressId')
  updateCurrentAddress(
    @Param('addressId') addressId: string,
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthenticatedCustomerUser,
    @Body() dto: UpdateCustomerAddressDto,
  ) {
    return this.customerService.updateCurrentAddress(tenant.id, user, addressId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('me/addresses/:addressId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCurrentAddress(
    @Param('addressId') addressId: string,
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthenticatedCustomerUser,
  ) {
    return this.customerService.removeCurrentAddress(tenant.id, user, addressId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager, UserRole.superadmin)
  @Get()
  findAll(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthenticatedCustomerUser,
    @Query() query: CustomerQuery,
  ) {
    return this.customerService.findAllForUser(tenant.id, user, query.page, query.pageSize, query.search);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager, UserRole.superadmin)
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthenticatedCustomerUser,
  ) {
    return this.customerService.findByIdForUser(id, tenant.id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager, UserRole.superadmin)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthenticatedCustomerUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customerService.createForUser(tenant.id, user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager, UserRole.superadmin)
  @Put(':id')
  update(
    @Param('id') id: string,
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthenticatedCustomerUser,
    @Body() dto: CreateCustomerDto,
  ) {
    return this.customerService.updateForUser(id, tenant.id, user, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager, UserRole.superadmin)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthenticatedCustomerUser,
  ) {
    return this.customerService.removeForUser(id, tenant.id, user);
  }
}
