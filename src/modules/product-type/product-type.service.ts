import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ProductTypeRepository } from './product-type.repository';
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import { serialize } from '../../common/utils/serializer';

@Injectable()
export class ProductTypeService {
  constructor(private readonly repo: ProductTypeRepository) {}

  async findAll(tenantId: string) {
    return (await this.repo.findAll(tenantId)).map(serialize);
  }

  async findById(id: string, tenantId: string) {
    const pt = await this.repo.findById(id, tenantId);
    if (!pt) throw new NotFoundException({ code: 'PRODUCT_TYPE_NOT_FOUND', message: 'Product type not found' });
    return serialize(pt);
  }

  async create(tenantId: string, dto: CreateProductTypeDto) {
    const existing = await this.repo.findBySlug(dto.slug, tenantId);
    if (existing) throw new ConflictException({ code: 'SLUG_TAKEN', message: `Product type slug '${dto.slug}' already exists` });

    return serialize(await this.repo.create({ ...dto, tenant: { connect: { id: tenantId } } }));
  }

  async update(id: string, tenantId: string, dto: Partial<CreateProductTypeDto>) {
    await this.findById(id, tenantId);
    return serialize(await this.repo.update(id, dto));
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.findById(id, tenantId);
    await this.repo.delete(id);
  }
}
