import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Brand, Prisma } from '@prisma/client';

@Injectable()
export class BrandRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string): Promise<Brand[]> {
    return this.prisma.brand.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  findBySlug(slug: string, tenantId: string): Promise<Brand | null> {
    return this.prisma.brand.findUnique({ where: { slug_tenantId: { slug, tenantId } } });
  }

  findById(id: string, tenantId: string): Promise<Brand | null> {
    return this.prisma.brand.findFirst({ where: { id, tenantId } });
  }

  create(data: Prisma.BrandCreateInput): Promise<Brand> {
    return this.prisma.brand.create({ data });
  }

  update(id: string, data: Prisma.BrandUpdateInput): Promise<Brand> {
    return this.prisma.brand.update({ where: { id }, data });
  }

  delete(id: string): Promise<Brand> {
    return this.prisma.brand.delete({ where: { id } });
  }
}
