import { Injectable, NotFoundException } from '@nestjs/common';
import { BrandRepository } from './brand.repository';
import { CreateBrandDto } from './dto/create-brand.dto';
import { serialize } from '../../common/utils/serializer';
import { slugify } from '../../common/utils/slugify';

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
    const slug = await this.resolveSlug(dto.slug ?? slugify(dto.name), tenantId);
    const brand = await this.repo.create({ ...dto, slug, tenant: { connect: { id: tenantId } } });
    return serialize(brand);
  }

  private async resolveSlug(base: string, tenantId: string): Promise<string> {
    if (!(await this.repo.findBySlug(base, tenantId))) return base;
    let i = 2;
    while (await this.repo.findBySlug(`${base}-${i}`, tenantId)) i++;
    return `${base}-${i}`;
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
