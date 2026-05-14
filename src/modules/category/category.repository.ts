import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Category, Prisma } from '@prisma/client';

@Injectable()
export class CategoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string): Promise<Category[]> {
    return this.prisma.category.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  findBySlug(slug: string, tenantId: string): Promise<Category | null> {
    return this.prisma.category.findUnique({ where: { slug_tenantId: { slug, tenantId } } });
  }

  findById(id: string, tenantId: string): Promise<Category | null> {
    return this.prisma.category.findFirst({ where: { id, tenantId } });
  }

  create(data: Prisma.CategoryCreateInput): Promise<Category> {
    return this.prisma.category.create({ data });
  }

  update(id: string, data: Prisma.CategoryUpdateInput): Promise<Category> {
    return this.prisma.category.update({ where: { id }, data });
  }

  delete(id: string): Promise<Category> {
    return this.prisma.category.delete({ where: { id } });
  }
}
