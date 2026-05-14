import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Order, OrderStatus, Prisma } from '@prisma/client';

export interface OrderFilter {
  tenantId: string;
  status?: OrderStatus;
  customerId?: string;
  search?: string;
}

const ORDER_INCLUDE = {
  customer: { select: { id: true, name: true, email: true, phone: true } },
} satisfies Prisma.OrderInclude;

@Injectable()
export class OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(filter: OrderFilter, skip: number, take: number) {
    return this.prisma.order.findMany({
      where: this.buildWhere(filter),
      include: ORDER_INCLUDE,
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  count(filter: OrderFilter): Promise<number> {
    return this.prisma.order.count({ where: this.buildWhere(filter) });
  }

  findById(id: string, tenantId: string) {
    return this.prisma.order.findFirst({ where: { id, tenantId }, include: ORDER_INCLUDE });
  }

  findByOrderId(orderId: string, tenantId: string) {
    return this.prisma.order.findFirst({ where: { orderId, tenantId }, include: ORDER_INCLUDE });
  }

  create(data: Prisma.OrderCreateInput): Promise<Order> {
    return this.prisma.order.create({ data });
  }

  update(id: string, data: Prisma.OrderUpdateInput): Promise<Order> {
    return this.prisma.order.update({ where: { id }, data });
  }

  private buildWhere(filter: OrderFilter): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = { tenantId: filter.tenantId };
    if (filter.status) where.orderStatus = filter.status;
    if (filter.customerId) where.customerId = filter.customerId;
    if (filter.search) {
      where.OR = [
        { orderId: { contains: filter.search, mode: 'insensitive' } },
        { confirmationNumber: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    return where;
  }
}
