import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CategoryRepository } from './category.repository';
import { CreateCategoryDto } from './dto/create-category.dto';
import { serialize } from '../../common/utils/serializer';

@Injectable()
export class CategoryService {
  constructor(private readonly repo: CategoryRepository) {}

  async findAll(tenantId: string) {
    const items = await this.repo.findAll(tenantId);
    return items.map(serialize);
  }

  async findById(id: string, tenantId: string) {
    const category = await this.repo.findById(id, tenantId);
    if (!category) throw new NotFoundException({ code: 'CATEGORY_NOT_FOUND', message: 'Category not found' });
    return serialize(category);
  }

  async create(tenantId: string, dto: CreateCategoryDto) {
    const existing = await this.repo.findBySlug(dto.slug, tenantId);
    if (existing) throw new ConflictException({ code: 'SLUG_TAKEN', message: `Category slug '${dto.slug}' already exists` });

    const category = await this.repo.create({
      ...dto,
      tenant: { connect: { id: tenantId } },
    });
    return serialize(category);
  }

  async update(id: string, tenantId: string, dto: Partial<CreateCategoryDto>) {
    await this.findById(id, tenantId);
    const updated = await this.repo.update(id, dto);
    return serialize(updated);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.findById(id, tenantId);
    await this.repo.delete(id);
  }
}
