import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { SuperadminService } from './superadmin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole, TenantStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

class PaginationQuery {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) pageSize?: number;
}

class SetStatusDto {
  @IsEnum(TenantStatus)
  status: TenantStatus;
}

class SetActiveDto {
  @IsBoolean()
  isActive: boolean;
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.superadmin)
@Controller('superadmin')
export class SuperadminController {
  constructor(private readonly superadminService: SuperadminService) {}

  @Get('tenants')
  listTenants(@Query() query: PaginationQuery) {
    return this.superadminService.listTenants(query.page, query.pageSize);
  }

  @Get('tenants/:id')
  getTenant(@Param('id') id: string) {
    return this.superadminService.getTenant(id);
  }

  @Put('tenants/:id/status')
  setTenantStatus(@Param('id') id: string, @Body() dto: SetStatusDto) {
    return this.superadminService.setTenantStatus(id, dto.status);
  }

  @Get('users')
  listUsers(@Query() query: PaginationQuery) {
    return this.superadminService.listUsers(query.page, query.pageSize);
  }

  @Put('users/:id/active')
  setUserActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.superadminService.setUserActive(id, dto.isActive);
  }
}
