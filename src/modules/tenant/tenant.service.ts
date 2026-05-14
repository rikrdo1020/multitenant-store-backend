import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Tenant, TenantStatus } from '@prisma/client';
import { TenantRepository } from './tenant.repository';
import { serialize, serializeList } from '../../common/utils/serializer';

export interface CreateTenantInput {
  slug: string;
  name: string;
  ownerId: string;
  description?: string;
  primaryColor?: string;
}

@Injectable()
export class TenantService {
  constructor(private readonly repo: TenantRepository) {}

  async findBySlug(slug: string): Promise<Tenant | null> {
    return this.repo.findBySlug(slug);
  }

  async findByIdOrFail(id: string) {
    const tenant = await this.repo.findById(id);
    if (!tenant) {
      throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: `Tenant not found` });
    }
    return serialize(tenant);
  }

  async findAll(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.repo.findAll({ skip, take: pageSize }),
      this.repo.count(),
    ]);
    return serializeList(items, { page, pageSize, total });
  }

  async create(input: CreateTenantInput) {
    const existing = await this.repo.findBySlug(input.slug);
    if (existing) {
      throw new ConflictException({ code: 'SLUG_TAKEN', message: `Slug '${input.slug}' is already taken` });
    }

    const tenant = await this.repo.create({
      slug: input.slug,
      name: input.name,
      description: input.description,
      primaryColor: input.primaryColor ?? '#000000',
      owner: { connect: { id: input.ownerId } },
    });

    return serialize(tenant);
  }

  async updateStatus(id: string, status: TenantStatus) {
    await this.findByIdOrFail(id);
    const updated = await this.repo.updateStatus(id, status);
    return serialize(updated);
  }
}
