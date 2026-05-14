import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, ProductType } from '@prisma/client';

@Injectable()
export class ProductTypeRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string): Promise<ProductType[]> {
    return this.prisma.productType.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  findBySlug(slug: string, tenantId: string): Promise<ProductType | null> {
    return this.prisma.productType.findUnique({ where: { slug_tenantId: { slug, tenantId } } });
  }

  findById(id: string, tenantId: string): Promise<ProductType | null> {
    return this.prisma.productType.findFirst({ where: { id, tenantId } });
  }

  create(data: Prisma.ProductTypeCreateInput): Promise<ProductType> {
    return this.prisma.productType.create({ data });
  }

  update(id: string, data: Prisma.ProductTypeUpdateInput): Promise<ProductType> {
    return this.prisma.productType.update({ where: { id }, data });
  }

  delete(id: string): Promise<ProductType> {
    return this.prisma.productType.delete({ where: { id } });
  }
}
