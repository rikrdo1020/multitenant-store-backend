import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsEnum, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { AnalyticsService, GroupBy } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { UserRole, Tenant } from '@prisma/client';

const DEFAULT_FROM = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d;
};

class AnalyticsQuery {
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}

class SalesQuery extends AnalyticsQuery {
  @IsOptional() @IsEnum(['day', 'week', 'month']) groupBy?: GroupBy;
}

class TopProductsQuery extends AnalyticsQuery {
  @IsOptional() @IsInt() @Min(1) @Max(50) @Type(() => Number) limit?: number;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.manager, UserRole.superadmin)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('overview')
  overview(@CurrentTenant() tenant: Tenant, @Query() q: AnalyticsQuery) {
    const { from, to } = this.parseDates(q);
    return this.analyticsService.getOverview(tenant.id, from, to);
  }

  @Get('sales')
  sales(@CurrentTenant() tenant: Tenant, @Query() q: SalesQuery) {
    const { from, to } = this.parseDates(q);
    return this.analyticsService.getSales(tenant.id, from, to, q.groupBy ?? 'day');
  }

  @Get('top-products')
  topProducts(@CurrentTenant() tenant: Tenant, @Query() q: TopProductsQuery) {
    const { from, to } = this.parseDates(q);
    return this.analyticsService.getTopProducts(tenant.id, q.limit ?? 10, from, to);
  }

  @Get('customers')
  customers(@CurrentTenant() tenant: Tenant, @Query() q: AnalyticsQuery) {
    const { from, to } = this.parseDates(q);
    return this.analyticsService.getCustomers(tenant.id, from, to);
  }

  private parseDates(q: AnalyticsQuery) {
    const from = q.from ? new Date(q.from) : DEFAULT_FROM();
    const to = q.to ? new Date(q.to) : new Date();
    return { from, to };
  }
}
