import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderRepository } from './order.repository';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderStatus } from '@prisma/client';
import { serialize, serializeList } from '../../common/utils/serializer';
import { nanoid } from 'nanoid';

export interface OrderListFilter {
  status?: OrderStatus;
  customerId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class OrderService {
  constructor(private readonly repo: OrderRepository) {}

  async findAll(tenantId: string, filter: OrderListFilter = {}) {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      this.repo.findMany({ tenantId, status: filter.status, customerId: filter.customerId, search: filter.search }, skip, pageSize),
      this.repo.count({ tenantId, status: filter.status, customerId: filter.customerId, search: filter.search }),
    ]);

    return serializeList(items, { page, pageSize, total });
  }

  async findById(id: string, tenantId: string) {
    const order = await this.repo.findById(id, tenantId);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    return serialize(order);
  }

  async findByOrderId(orderId: string, tenantId: string) {
    const order = await this.repo.findByOrderId(orderId, tenantId);
    if (!order) throw new NotFoundException({ code: 'ORDER_NOT_FOUND', message: 'Order not found' });
    return serialize(order);
  }

  async create(tenantId: string, dto: CreateOrderDto) {
    const orderId = `ORD-${nanoid(10).toUpperCase()}`;

    const total = dto.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) + dto.shippingCost;

    const order = await this.repo.create({
      orderId,
      total,
      shippingCost: dto.shippingCost,
      customerData: dto.customerData as any,
      shippingData: dto.shippingData as any,
      items: dto.items as any,
      paymentMethod: dto.paymentMethod,
      shippingMethodId: dto.shippingMethodId,
      shippingLocationId: dto.shippingLocationId,
      tenant: { connect: { id: tenantId } },
      ...(dto.customerId && { customer: { connect: { id: dto.customerId } } }),
    });

    return serialize(order);
  }

  async updateStatus(id: string, tenantId: string, dto: UpdateOrderStatusDto) {
    await this.findById(id, tenantId);

    const updated = await this.repo.update(id, {
      ...(dto.orderStatus && { orderStatus: dto.orderStatus }),
      ...(dto.transactionId !== undefined && { transactionId: dto.transactionId }),
      ...(dto.confirmationNumber !== undefined && { confirmationNumber: dto.confirmationNumber }),
      ...(dto.dispatched !== undefined && { dispatched: dto.dispatched }),
    });

    return serialize(updated);
  }
}
