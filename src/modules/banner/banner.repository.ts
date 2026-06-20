import { Injectable } from '@nestjs/common';
import { Prisma, StoreBanner } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BannerRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, onlyActive = false): Promise<StoreBanner[]> {
    return this.prisma.storeBanner.findMany({
      where: { tenantId, ...(onlyActive ? { active: true } : {}) },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
    });
  }

  findById(id: string, tenantId: string): Promise<StoreBanner | null> {
    return this.prisma.storeBanner.findFirst({ where: { id, tenantId } });
  }

  create(data: Prisma.StoreBannerCreateInput): Promise<StoreBanner> {
    return this.prisma.storeBanner.create({ data });
  }

  update(
    id: string,
    tenantId: string,
    data: Prisma.StoreBannerUpdateInput,
  ): Promise<StoreBanner> {
    return this.prisma.storeBanner.update({
      where: { id, tenantId },
      data,
    });
  }

  delete(id: string, tenantId: string): Promise<StoreBanner> {
    return this.prisma.storeBanner.delete({ where: { id, tenantId } });
  }
}
