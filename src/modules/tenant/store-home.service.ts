import { Injectable } from '@nestjs/common';
import { serialize } from '../../common/utils/serializer';
import { StoreHomeRepository } from './store-home.repository';

@Injectable()
export class StoreHomeService {
  constructor(private readonly repo: StoreHomeRepository) {}

  async getHome(tenantId: string) {
    const [tenant, featuredProducts, categories, latestProducts, banners] =
      await Promise.all([
        this.repo.findTenantProfile(tenantId),
        this.repo.findFeaturedProducts(tenantId),
        this.repo.findCategories(tenantId),
        this.repo.findLatestProducts(tenantId),
        this.repo.findActiveBanners(tenantId),
      ]);

    return serialize({
      tenant,
      featuredProducts: featuredProducts.map((product) =>
        this.withStockStatus(product),
      ),
      categories: categories.map((category) => ({
        ...category,
        image: category.images[0] ?? null,
      })),
      latestProducts: latestProducts.map((product) =>
        this.withStockStatus(product),
      ),
      banners,
    });
  }

  private withStockStatus<T extends { stock: number; reservedStock?: number }>(
    product: T,
  ) {
    const availableStock = Math.max(
      0,
      product.stock - (product.reservedStock ?? 0),
    );

    return {
      ...product,
      availableStock,
      stockStatus: this.getStockStatus(availableStock),
    };
  }

  private getStockStatus(availableStock: number) {
    if (availableStock <= 0) return 'out_of_stock';
    if (availableStock <= 5) return 'low_stock';
    return 'in_stock';
  }
}
