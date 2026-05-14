import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Combo, Prisma } from '@prisma/client';

@Injectable()
export class ComboRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string): Promise<Combo[]> {
    return this.prisma.combo.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' } });
  }

  findById(id: string, tenantId: string): Promise<Combo | null> {
    return this.prisma.combo.findFirst({ where: { id, tenantId } });
  }

  create(data: Prisma.ComboCreateInput): Promise<Combo> {
    return this.prisma.combo.create({ data });
  }

  update(id: string, data: Prisma.ComboUpdateInput): Promise<Combo> {
    return this.prisma.combo.update({ where: { id }, data });
  }

  delete(id: string): Promise<Combo> {
    return this.prisma.combo.delete({ where: { id } });
  }
}
