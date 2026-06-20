import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, Product, ProductStatus } from '@prisma/client';

export interface ProductFilter {
  tenantId: string;
  search?: string;
  status?: ProductStatus;
  categoryId?: string;
  brandId?: string;
  tagId?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: 'price_asc' | 'price_desc' | 'newest' | 'name_asc' | 'name_desc';
}

const PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  brand: { select: { id: true, name: true, slug: true } },
  tags: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(filter: ProductFilter, skip: number, take: number) {
    const where = this.buildWhere(filter);
    return this.prisma.product.findMany({
      where,
      include: PRODUCT_INCLUDE,
      skip,
      take,
      orderBy: this.buildOrderBy(filter.sort),
    });
  }

  private buildOrderBy(sort?: string): Prisma.ProductOrderByWithRelationInput[] {
    if (sort === 'price_asc') return [{ price: 'asc' }];
    if (sort === 'price_desc') return [{ price: 'desc' }];
    if (sort === 'name_asc') return [{ name: 'asc' }];
    if (sort === 'name_desc') return [{ name: 'desc' }];
    return [{ name: 'asc' }];
  }

  count(filter: ProductFilter): Promise<number> {
    return this.prisma.product.count({ where: this.buildWhere(filter) });
  }

  findBySlug(slug: string, tenantId: string, onlyPublished = true) {
    return this.prisma.product.findFirst({
      where: {
        slug,
        tenantId,
        ...(onlyPublished ? { productStatus: 'published' } : {}),
      },
      include: PRODUCT_INCLUDE,
    });
  }

  findBySlugAdmin(slug: string, tenantId: string) {
    return this.findBySlug(slug, tenantId, false);
  }

  findById(id: string, tenantId: string) {
    return this.prisma.product.findFirst({
      where: { id, tenantId },
      include: PRODUCT_INCLUDE,
    });
  }

  create(data: Prisma.ProductCreateInput): Promise<Product> {
    return this.prisma.product.create({ data, include: PRODUCT_INCLUDE } as any);
  }

  update(id: string, tenantId: string, data: Prisma.ProductUpdateInput): Promise<Product> {
    return this.prisma.product.update({
      where: { id, tenantId },
      data,
      include: PRODUCT_INCLUDE,
    } as any);
  }

  delete(id: string, tenantId: string): Promise<Product> {
    return this.prisma.product.delete({ where: { id, tenantId } });
  }

  private buildWhere(filter: ProductFilter): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = { tenantId: filter.tenantId };

    if (filter.status) where.productStatus = filter.status;
    if (filter.categoryId) where.categoryId = filter.categoryId;
    if (filter.brandId) where.brandId = filter.brandId;
    if (filter.tagId) where.tags = { some: { id: filter.tagId } };

    if (filter.search) {
      where.OR = [
        { name: { contains: filter.search, mode: 'insensitive' } },
        { dku: { contains: filter.search, mode: 'insensitive' } },
        { slug: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    if (filter.minPrice !== undefined || filter.maxPrice !== undefined) {
      where.price = {
        ...(filter.minPrice !== undefined ? { gte: filter.minPrice } : {}),
        ...(filter.maxPrice !== undefined ? { lte: filter.maxPrice } : {}),
      };
    }

    return where;
  }
}
