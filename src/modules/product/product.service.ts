import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ProductRepository } from './product.repository';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductFilterDto } from './dto/product-filter.dto';
import { serialize, serializeList } from '../../common/utils/serializer';
import { InputJsonValue } from '@prisma/client/runtime/library';

type UpdateProductInput = Partial<CreateProductDto>;

@Injectable()
export class ProductService {
  constructor(private readonly repo: ProductRepository) {}

  async findAll(tenantId: string, filter: ProductFilterDto) {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const filterParams = {
      tenantId,
      search: filter.search,
      status: filter.status,
      categoryId: filter.categoryId,
      brandId: filter.brandId,
      tagId: filter.tagId,
      minPrice: filter.minPrice,
      maxPrice: filter.maxPrice,
      sort: filter.sort,
    };

    const [items, total] = await Promise.all([
      this.repo.findMany(filterParams, skip, pageSize),
      this.repo.count(filterParams),
    ]);

    return serializeList(items.map((item) => this.withStockStatus(item)), {
      page,
      pageSize,
      total,
    });
  }

  async findBySlug(slug: string, tenantId: string) {
    const product = await this.repo.findBySlug(slug, tenantId);
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product '${slug}' not found` });
    }
    return serialize(this.withStockStatus(product));
  }

  async findById(id: string, tenantId: string) {
    const product = await this.repo.findById(id, tenantId);
    if (!product) {
      throw new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: `Product not found` });
    }
    return serialize(this.withStockStatus(product));
  }

  async create(tenantId: string, dto: CreateProductDto) {
    const existing = await this.repo.findBySlug(dto.slug, tenantId, false);
    if (existing) {
      throw new ConflictException({ code: 'SLUG_TAKEN', message: `Product slug '${dto.slug}' already exists` });
    }

    const { tagIds, categoryId, brandId, description, options, ...rest } = dto;

    const product = await this.repo.create({
      ...rest,
      price: dto.price,
      description: description as InputJsonValue | undefined,
      options: options as InputJsonValue | undefined,
      tenant: { connect: { id: tenantId } },
      ...(categoryId && { category: { connect: { id: categoryId } } }),
      ...(brandId && { brand: { connect: { id: brandId } } }),
      ...(tagIds?.length && { tags: { connect: tagIds.map((id) => ({ id })) } }),
    });

    return serialize(this.withStockStatus(product));
  }

  async update(id: string, tenantId: string, dto: UpdateProductInput) {
    await this.findById(id, tenantId);

    const { tagIds, categoryId, brandId, description, options, ...rest } = dto;

    const product = await this.repo.update(id, tenantId, {
      ...rest,
      ...(description !== undefined && { description: description as InputJsonValue }),
      ...(options !== undefined && { options: options as InputJsonValue }),
      ...(categoryId !== undefined && {
        category: categoryId ? { connect: { id: categoryId } } : { disconnect: true },
      }),
      ...(brandId !== undefined && {
        brand: brandId ? { connect: { id: brandId } } : { disconnect: true },
      }),
      ...(tagIds !== undefined && {
        tags: { set: tagIds.map((tid) => ({ id: tid })) },
      }),
    });

    return serialize(this.withStockStatus(product));
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.findById(id, tenantId);
    await this.repo.delete(id, tenantId);
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
