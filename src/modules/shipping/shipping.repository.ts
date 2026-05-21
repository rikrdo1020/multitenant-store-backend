import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma, ShippingMethod } from '@prisma/client';

const SHIPPING_INCLUDE = {
  logistics: true,
} satisfies Prisma.ShippingMethodInclude;

@Injectable()
export class ShippingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, includeInactive = false) {
    return this.prisma.shippingMethod.findMany({
      where: {
        tenantId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: SHIPPING_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  findById(id: string, tenantId: string, includeInactive = false) {
    return this.prisma.shippingMethod.findFirst({
      where: {
        id,
        tenantId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      include: SHIPPING_INCLUDE,
    });
  }

  create(data: Prisma.ShippingMethodCreateInput): Promise<ShippingMethod> {
    return this.prisma.shippingMethod.create({ data, include: SHIPPING_INCLUDE } as any);
  }

  update(id: string, data: Prisma.ShippingMethodUpdateInput) {
    return this.prisma.shippingMethod.update({ where: { id }, data, include: SHIPPING_INCLUDE } as any);
  }

  delete(id: string): Promise<ShippingMethod> {
    return this.prisma.shippingMethod.delete({ where: { id } });
  }
}
