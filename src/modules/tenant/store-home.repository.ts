import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const HOME_PRODUCT_INCLUDE = {
  category: { select: { id: true, name: true, slug: true } },
  brand: { select: { id: true, name: true, slug: true } },
  tags: { select: { id: true, name: true, slug: true } },
} as const;

@Injectable()
export class StoreHomeRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTenantProfile(tenantId: string) {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        logo: true,
        description: true,
        primaryColor: true,
        settings: { select: { currency: true } },
      },
    });
  }

  findFeaturedProducts(tenantId: string) {
    return this.prisma.product.findMany({
      where: {
        tenantId,
        productStatus: 'published',
        isFeatured: true,
      },
      include: HOME_PRODUCT_INCLUDE,
      orderBy: [{ featuredOrder: 'asc' }, { createdAt: 'desc' }],
      take: 8,
    });
  }

  findLatestProducts(tenantId: string) {
    return this.prisma.product.findMany({
      where: { tenantId, productStatus: 'published' },
      include: HOME_PRODUCT_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 8,
    });
  }

  findCategories(tenantId: string) {
    return this.prisma.category.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        images: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  findActiveBanners(tenantId: string) {
    return this.prisma.storeBanner.findMany({
      where: { tenantId, active: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
  }
}
