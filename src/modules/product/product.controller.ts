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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ProductService } from './product.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductFilterDto } from './dto/product-filter.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles, Public } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { UserRole, Tenant } from '@prisma/client';

@Controller('products')
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  // Storefront — public
  @Public()
  @Get()
  findAll(@CurrentTenant() tenant: Tenant, @Query() filter: ProductFilterDto) {
    return this.productService.findAll(tenant.id, filter);
  }

  @Public()
  @Get(':slug')
  findBySlug(@Param('slug') slug: string, @CurrentTenant() tenant: Tenant) {
    return this.productService.findBySlug(slug, tenant.id);
  }

  // Admin
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager, UserRole.superadmin)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentTenant() tenant: Tenant, @Body() dto: CreateProductDto) {
    return this.productService.create(tenant.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.manager, UserRole.superadmin)
  @Put(':id')
  update(
    @Param('id') id: string,
    @CurrentTenant() tenant: Tenant,
    @Body() dto: UpdateProductDto,
  ) {
    return this.productService.update(id, tenant.id, dto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.admin, UserRole.superadmin)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentTenant() tenant: Tenant) {
    return this.productService.remove(id, tenant.id);
  }
}
