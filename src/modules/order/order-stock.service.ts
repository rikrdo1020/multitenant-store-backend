import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Order, OrderStatus, Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface StockReservationItem {
  productId: string;
  quantity: number;
}

export interface OrderStatusTransitionData {
  orderStatus?: OrderStatus;
  transactionId?: string;
  confirmationNumber?: string;
  dispatched?: boolean;
}

interface TransitionOptions {
  onlyFrom?: OrderStatus[];
}

type TransactionClient = Prisma.TransactionClient;

const STOCK_HELD_STATUSES = new Set<OrderStatus>([
  OrderStatus.pending,
  OrderStatus.paid,
]);
const STOCK_RELEASED_STATUSES = new Set<OrderStatus>([
  OrderStatus.cancelled,
  OrderStatus.failed,
  OrderStatus.rejected,
  OrderStatus.expired,
]);

@Injectable()
export class OrderStockService {
  constructor(private readonly prisma: PrismaService) {}

  createOrderWithStockReservation(
    tenantId: string,
    data: Prisma.OrderCreateInput,
    items: StockReservationItem[],
  ): Promise<Order> {
    return this.prisma.$transaction(async (tx) => {
      await this.reserveStock(tx, tenantId, items);
      return tx.order.create({ data });
    });
  }

  async transitionOrderStatusById(
    id: string,
    tenantId: string,
    data: OrderStatusTransitionData,
  ): Promise<Order> {
    const updated = await this.transitionOrderStatus({ id, tenantId }, data);
    if (!updated) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }

    return updated;
  }

  transitionOrderStatusByOrderId(
    orderId: string,
    tenantId: string | undefined,
    data: OrderStatusTransitionData,
    options: TransitionOptions = {},
  ): Promise<Order | null> {
    return this.transitionOrderStatus(
      {
        orderId,
        ...(tenantId ? { tenantId } : {}),
      },
      data,
      options,
    );
  }

  private async transitionOrderStatus(
    where: Prisma.OrderWhereInput,
    data: OrderStatusTransitionData,
    options: TransitionOptions = {},
  ): Promise<Order | null> {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: {
          ...where,
          ...(options.onlyFrom
            ? { orderStatus: { in: options.onlyFrom } }
            : {}),
        },
        select: {
          id: true,
          tenantId: true,
          orderStatus: true,
          items: true,
        },
      });

      if (!order) return null;

      await this.applyStockTransition(tx, order, data.orderStatus);
      return tx.order.update({ where: { id: order.id }, data });
    });
  }

  private async applyStockTransition(
    tx: TransactionClient,
    order: {
      tenantId: string;
      orderStatus: OrderStatus;
      items: Prisma.JsonValue;
    },
    nextStatus?: OrderStatus,
  ): Promise<void> {
    if (!nextStatus || nextStatus === order.orderStatus) return;

    const items = this.getStockItems(order.items);
    if (
      STOCK_HELD_STATUSES.has(order.orderStatus) &&
      STOCK_RELEASED_STATUSES.has(nextStatus)
    ) {
      await this.restoreStock(tx, order.tenantId, items);
      return;
    }

    if (
      STOCK_RELEASED_STATUSES.has(order.orderStatus) &&
      STOCK_HELD_STATUSES.has(nextStatus)
    ) {
      await this.reserveStock(tx, order.tenantId, items);
    }
  }

  private async reserveStock(
    tx: TransactionClient,
    tenantId: string,
    items: StockReservationItem[],
  ): Promise<void> {
    for (const item of this.aggregateStockItems(items)) {
      const result = await tx.product.updateMany({
        where: {
          id: item.productId,
          tenantId,
          stock: { gte: item.quantity },
          productStatus: ProductStatus.published,
        },
        data: { stock: { decrement: item.quantity } },
      });

      if (result.count !== 1) {
        throw new BadRequestException({
          code: 'ORDER_INSUFFICIENT_STOCK',
          message: 'Requested quantity exceeds available stock',
        });
      }
    }
  }

  private async restoreStock(
    tx: TransactionClient,
    tenantId: string,
    items: StockReservationItem[],
  ): Promise<void> {
    for (const item of this.aggregateStockItems(items)) {
      await tx.product.updateMany({
        where: { id: item.productId, tenantId },
        data: { stock: { increment: item.quantity } },
      });
    }
  }

  private getStockItems(items: Prisma.JsonValue): StockReservationItem[] {
    if (!Array.isArray(items)) return [];

    return items.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];

      const snapshot = item as Record<string, unknown>;
      const productId = snapshot.productId;
      const quantity = Number(snapshot.quantity);

      if (
        typeof productId !== 'string' ||
        !Number.isFinite(quantity) ||
        quantity <= 0
      ) {
        return [];
      }

      return [{ productId, quantity }];
    });
  }

  private aggregateStockItems(
    items: StockReservationItem[],
  ): StockReservationItem[] {
    const aggregate = new Map<string, number>();

    for (const item of items) {
      aggregate.set(
        item.productId,
        (aggregate.get(item.productId) ?? 0) + item.quantity,
      );
    }

    return [...aggregate.entries()].map(([productId, quantity]) => ({
      productId,
      quantity,
    }));
  }
}
