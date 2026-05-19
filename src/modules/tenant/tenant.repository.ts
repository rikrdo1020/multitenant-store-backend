import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, Tenant, TenantStatus } from '@prisma/client';

@Injectable()
export class TenantRepository {
  constructor(private readonly prisma: PrismaService) {}

  findBySlug(slug: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { slug } });
  }

  findById(id: string): Promise<Tenant | null> {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  findAll(params: { skip?: number; take?: number }): Promise<Tenant[]> {
    return this.prisma.tenant.findMany({
      skip: params.skip,
      take: params.take,
      orderBy: { createdAt: 'desc' },
    });
  }

  findByOwner(ownerId: string): Promise<Tenant[]> {
    return this.prisma.tenant.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  isSlugTaken(slug: string, excludeId?: string): Promise<boolean> {
    return this.prisma.tenant
      .findFirst({ where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) } })
      .then((t) => t !== null);
  }

  count(): Promise<number> {
    return this.prisma.tenant.count();
  }

  create(data: Prisma.TenantCreateInput): Promise<Tenant> {
    return this.prisma.tenant.create({ data });
  }

  update(id: string, data: Prisma.TenantUpdateInput): Promise<Tenant> {
    return this.prisma.tenant.update({ where: { id }, data });
  }

  updateStatus(id: string, status: TenantStatus): Promise<Tenant> {
    return this.prisma.tenant.update({ where: { id }, data: { status } });
  }
}
