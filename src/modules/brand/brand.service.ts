import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BrandRepository } from './brand.repository';
import { CreateBrandDto } from './dto/create-brand.dto';
import { serialize } from '../../common/utils/serializer';

@Injectable()
export class BrandService {
  constructor(private readonly repo: BrandRepository) {}

  async findAll(tenantId: string) {
    const items = await this.repo.findAll(tenantId);
    return items.map(serialize);
  }

  async findById(id: string, tenantId: string) {
    const brand = await this.repo.findById(id, tenantId);
    if (!brand) throw new NotFoundException({ code: 'BRAND_NOT_FOUND', message: 'Brand not found' });
    return serialize(brand);
  }

  async create(tenantId: string, dto: CreateBrandDto) {
    const existing = await this.repo.findBySlug(dto.slug, tenantId);
    if (existing) throw new ConflictException({ code: 'SLUG_TAKEN', message: `Brand slug '${dto.slug}' already exists` });

    const brand = await this.repo.create({ ...dto, tenant: { connect: { id: tenantId } } });
    return serialize(brand);
  }

  async update(id: string, tenantId: string, dto: Partial<CreateBrandDto>) {
    await this.findById(id, tenantId);
    const updated = await this.repo.update(id, dto);
    return serialize(updated);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.findById(id, tenantId);
    await this.repo.delete(id);
  }
}
