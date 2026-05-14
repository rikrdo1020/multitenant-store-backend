import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, Tag } from '@prisma/client';

@Injectable()
export class TagRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string): Promise<Tag[]> {
    return this.prisma.tag.findMany({ where: { tenantId }, orderBy: { name: 'asc' } });
  }

  findBySlug(slug: string, tenantId: string): Promise<Tag | null> {
    return this.prisma.tag.findUnique({ where: { slug_tenantId: { slug, tenantId } } });
  }

  findById(id: string, tenantId: string): Promise<Tag | null> {
    return this.prisma.tag.findFirst({ where: { id, tenantId } });
  }

  create(data: Prisma.TagCreateInput): Promise<Tag> {
    return this.prisma.tag.create({ data });
  }

  update(id: string, data: Prisma.TagUpdateInput): Promise<Tag> {
    return this.prisma.tag.update({ where: { id }, data });
  }

  delete(id: string): Promise<Tag> {
    return this.prisma.tag.delete({ where: { id } });
  }
}
