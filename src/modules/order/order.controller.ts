import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { OrderService } from './order.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, Public } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { OrderStatus, UserRole, Tenant } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import type { AuthenticatedOrderUser } from './order.types';

class OrderFilterQuery {
  @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) pageSize?: number;
}

@Controller('orders')
export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  // Storefront: customers create orders without auth.
  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateOrderDto) {
    return this.orderService.create(tenant.id, dto);
  }

  // Storefront: track own order by public orderId.
  @Public()
  @Get('track/:orderId')
  track(@Param('orderId') orderId: string, @CurrentTenant() tenant: Tenant) {
    return this.orderService.findByOrderId(orderId, tenant.id);
  }

  // Storefront account + admin order list. Service applies tenant membership/customer-email scoping.
  @UseGuards(JwtAuthGuard)
  @Get()
  findAll(
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthenticatedOrderUser,
    @Query() filter: OrderFilterQuery,
  ) {
    return this.orderService.findAllForUser(tenant.id, user, filter);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthenticatedOrderUser,
  ) {
    return this.orderService.findByIdForUser(id, tenant.id, user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager, UserRole.superadmin)
  @Put(':id/status')
  updateStatus(
    @Param('id') id: string,
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: AuthenticatedOrderUser,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.orderService.updateStatusForUser(id, tenant.id, user, dto);
  }
}
