import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TagRepository } from './tag.repository';
import { CreateTagDto } from './dto/create-tag.dto';
import { serialize } from '../../common/utils/serializer';

@Injectable()
export class TagService {
  constructor(private readonly repo: TagRepository) {}

  async findAll(tenantId: string) {
    return (await this.repo.findAll(tenantId)).map(serialize);
  }

  async findById(id: string, tenantId: string) {
    const tag = await this.repo.findById(id, tenantId);
    if (!tag) throw new NotFoundException({ code: 'TAG_NOT_FOUND', message: 'Tag not found' });
    return serialize(tag);
  }

  async create(tenantId: string, dto: CreateTagDto) {
    const existing = await this.repo.findBySlug(dto.slug, tenantId);
    if (existing) throw new ConflictException({ code: 'SLUG_TAKEN', message: `Tag slug '${dto.slug}' already exists` });

    const tag = await this.repo.create({ ...dto, tenant: { connect: { id: tenantId } } });
    return serialize(tag);
  }

  async update(id: string, tenantId: string, dto: Partial<CreateTagDto>) {
    await this.findById(id, tenantId);
    return serialize(await this.repo.update(id, dto));
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.findById(id, tenantId);
    await this.repo.delete(id);
  }
}
