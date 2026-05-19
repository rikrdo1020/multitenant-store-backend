import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Order, OrderStatus, Prisma } from '@prisma/client';

export interface OrderFilter {
  tenantId: string;
  status?: OrderStatus;
  customerId?: string;
  customerEmail?: string;
  search?: string;
}

export interface OrderCustomerSnapshot {
  name: string;
  email: string;
  phone: string;
  notes?: string;
  address?: string;
  city?: string;
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

  findByIdForCustomerEmail(id: string, tenantId: string, customerEmail: string) {
    return this.prisma.order.findFirst({
      where: { ...this.buildWhere({ tenantId, customerEmail }), id },
      include: ORDER_INCLUDE,
    });
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

  findCustomerById(id: string, tenantId: string) {
    return this.prisma.customer.findFirst({ where: { id, tenantId } });
  }

  upsertCustomerFromOrder(tenantId: string, customer: OrderCustomerSnapshot) {
    return this.prisma.customer.upsert({
      where: { email_tenantId: { email: customer.email, tenantId } },
      update: {
        name: customer.name,
        phone: customer.phone,
        notes: customer.notes,
        address: customer.address,
        city: customer.city,
      },
      create: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        notes: customer.notes,
        address: customer.address,
        city: customer.city,
        tenant: { connect: { id: tenantId } },
      },
    });
  }

  hasTenantMembership(userId: string, tenantId: string) {
    return this.prisma.tenantMember.findFirst({
      where: { userId, tenantId },
      select: { id: true },
    });
  }

  private buildWhere(filter: OrderFilter): Prisma.OrderWhereInput {
    const where: Prisma.OrderWhereInput = { tenantId: filter.tenantId };
    if (filter.status) where.orderStatus = filter.status;
    if (filter.customerId) where.customerId = filter.customerId;
    const andFilters: Prisma.OrderWhereInput[] = [];

    if (filter.customerEmail) {
      andFilters.push({
        OR: [
          { customer: { is: { email: { equals: filter.customerEmail, mode: 'insensitive' } } } },
          { customerData: { path: ['email'], equals: filter.customerEmail } },
        ],
      });
    }

    if (filter.search) {
      andFilters.push({
        OR: [
          { orderId: { contains: filter.search, mode: 'insensitive' } },
          { confirmationNumber: { contains: filter.search, mode: 'insensitive' } },
        ],
      });
    }
    if (andFilters.length > 0) where.AND = andFilters;
    return where;
  }
}
