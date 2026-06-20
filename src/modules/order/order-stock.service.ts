import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Order, OrderStatus, Prisma } from '@prisma/client';
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
  trackingNumber?: string;
  trackingCarrier?: string;
  trackingUrl?: string;
  adminNote?: string;
  changedBy?: string;
}

interface TransitionOptions {
  onlyFrom?: OrderStatus[];
}

type TransactionClient = Prisma.TransactionClient;

const RESERVED_STATUSES = new Set<OrderStatus>([OrderStatus.pending]);
const CONSUMED_STATUSES = new Set<OrderStatus>([
  OrderStatus.paid,
  OrderStatus.processing,
  OrderStatus.ready,
  OrderStatus.shipped,
  OrderStatus.delivered,
]);
const RELEASED_STATUSES = new Set<OrderStatus>([
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
      const order = await tx.order.create({ data });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: order.orderStatus,
          note: 'Order created',
          changedBy: 'system',
        },
      });
      return order;
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

  async expirePendingReservations(minutes = 15): Promise<number> {
    const expiresBefore = new Date(Date.now() - minutes * 60 * 1000);
    const orders = await this.prisma.order.findMany({
      where: {
        orderStatus: OrderStatus.pending,
        createdAt: { lt: expiresBefore },
      },
      select: { id: true, tenantId: true },
      take: 100,
    });

    for (const order of orders) {
      await this.transitionOrderStatusById(order.id, order.tenantId, {
        orderStatus: OrderStatus.expired,
        adminNote: 'Reservation expired automatically',
        changedBy: 'system',
      });
    }

    return orders.length;
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
          trackingNumber: true,
        },
      });

      if (!order) return null;

      this.assertTrackingRequirements(order, data);
      await this.applyStockTransition(tx, order, data.orderStatus);

      const { adminNote, changedBy, ...orderData } = data;
      const updated = await tx.order.update({
        where: { id: order.id },
        data: orderData,
      });

      if (data.orderStatus && data.orderStatus !== order.orderStatus) {
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: data.orderStatus,
            note: adminNote,
            changedBy,
          },
        });
      }

      return updated;
    });
  }

  private assertTrackingRequirements(
    order: { trackingNumber: string | null },
    data: OrderStatusTransitionData,
  ): void {
    if (data.orderStatus !== OrderStatus.shipped) return;

    const trackingNumber = data.trackingNumber ?? order.trackingNumber;
    if (!trackingNumber?.trim()) {
      throw new BadRequestException({
        code: 'ORDER_TRACKING_NUMBER_REQUIRED',
        message: 'Tracking number is required when shipping an order',
      });
    }
  }

  private async applyStockTransition(
    tx: TransactionClient,
    order: {
      id: string;
      tenantId: string;
      orderStatus: OrderStatus;
      items: Prisma.JsonValue;
    },
    nextStatus?: OrderStatus,
  ): Promise<void> {
    if (!nextStatus || nextStatus === order.orderStatus) return;

    const currentState = this.stockState(order.orderStatus);
    const nextState = this.stockState(nextStatus);
    if (currentState === nextState) return;

    const items = this.getStockItems(order.items);

    if (currentState === 'reserved' && nextState === 'consumed') {
      await this.consumeReservedStock(tx, order.tenantId, items);
      return;
    }

    if (currentState === 'reserved' && nextState === 'released') {
      await this.releaseReservedStock(tx, order.tenantId, items);
      return;
    }

    if (currentState === 'consumed' && nextState === 'released') {
      await this.restoreConsumedStock(tx, order.tenantId, items);
      return;
    }

    if (currentState === 'consumed' && nextState === 'reserved') {
      await this.moveConsumedStockToReserved(tx, order.tenantId, items);
      return;
    }

    if (currentState === 'released' && nextState === 'reserved') {
      await this.reserveStock(tx, order.tenantId, items);
      return;
    }

    if (currentState === 'released' && nextState === 'consumed') {
      await this.consumeAvailableStock(tx, order.tenantId, items);
    }
  }

  private stockState(
    status: OrderStatus,
  ): 'reserved' | 'consumed' | 'released' {
    if (RESERVED_STATUSES.has(status)) return 'reserved';
    if (CONSUMED_STATUSES.has(status)) return 'consumed';
    if (RELEASED_STATUSES.has(status)) return 'released';
    return 'released';
  }

  private async reserveStock(
    tx: TransactionClient,
    tenantId: string,
    items: StockReservationItem[],
  ): Promise<void> {
    for (const item of this.aggregateStockItems(items)) {
      const count = await tx.$executeRaw`
        UPDATE "Product"
        SET "reservedStock" = "reservedStock" + ${item.quantity}
        WHERE "id" = ${item.productId}
          AND "tenantId" = ${tenantId}
          AND "productStatus" = 'published'
          AND ("stock" - "reservedStock") >= ${item.quantity}
      `;

      this.assertStockMutation(count, item);
    }
  }

  private async consumeReservedStock(
    tx: TransactionClient,
    tenantId: string,
    items: StockReservationItem[],
  ): Promise<void> {
    for (const item of this.aggregateStockItems(items)) {
      const count = await tx.$executeRaw`
        UPDATE "Product"
        SET
          "stock" = "stock" - ${item.quantity},
          "reservedStock" = "reservedStock" - ${item.quantity}
        WHERE "id" = ${item.productId}
          AND "tenantId" = ${tenantId}
          AND "reservedStock" >= ${item.quantity}
          AND "stock" >= ${item.quantity}
      `;

      this.assertStockMutation(count, item);
    }
  }

  private async consumeAvailableStock(
    tx: TransactionClient,
    tenantId: string,
    items: StockReservationItem[],
  ): Promise<void> {
    for (const item of this.aggregateStockItems(items)) {
      const count = await tx.$executeRaw`
        UPDATE "Product"
        SET "stock" = "stock" - ${item.quantity}
        WHERE "id" = ${item.productId}
          AND "tenantId" = ${tenantId}
          AND "productStatus" = 'published'
          AND ("stock" - "reservedStock") >= ${item.quantity}
      `;

      this.assertStockMutation(count, item);
    }
  }

  private async releaseReservedStock(
    tx: TransactionClient,
    tenantId: string,
    items: StockReservationItem[],
  ): Promise<void> {
    for (const item of this.aggregateStockItems(items)) {
      await tx.product.updateMany({
        where: {
          id: item.productId,
          tenantId,
          reservedStock: { gte: item.quantity },
        },
        data: { reservedStock: { decrement: item.quantity } },
      });
    }
  }

  private async restoreConsumedStock(
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

  private async moveConsumedStockToReserved(
    tx: TransactionClient,
    tenantId: string,
    items: StockReservationItem[],
  ): Promise<void> {
    for (const item of this.aggregateStockItems(items)) {
      await tx.product.updateMany({
        where: { id: item.productId, tenantId },
        data: {
          stock: { increment: item.quantity },
          reservedStock: { increment: item.quantity },
        },
      });
    }
  }

  private assertStockMutation(count: number, item: StockReservationItem): void {
    if (count === 1) return;

    throw new UnprocessableEntityException({
      code: 'INSUFFICIENT_STOCK',
      message: 'Requested quantity exceeds available stock',
      details: [
        {
          productId: item.productId,
          requestedQuantity: item.quantity,
        },
      ],
    });
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
