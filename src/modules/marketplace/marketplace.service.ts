import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { serializeList } from '../../common/utils/serializer';

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  async listStores(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where: { status: 'active' },
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          slug: true,
          name: true,
          description: true,
          logo: true,
          primaryColor: true,
          products: {
            where: { isFeatured: true, productStatus: 'published' },
            orderBy: { featuredOrder: 'asc' },
            take: 4,
            select: {
              id: true,
              name: true,
              slug: true,
              price: true,
              images: true,
            },
          },
        },
      }),
      this.prisma.tenant.count({ where: { status: 'active' } }),
    ]);

    return serializeList(items, { page, pageSize, total });
  }
}
