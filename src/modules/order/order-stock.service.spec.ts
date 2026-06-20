import { OrderStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStockService } from './order-stock.service';

const TENANT_ID = 'tenant-1';

describe('OrderStockService', () => {
  const tx = {
    $executeRaw: vi.fn(),
    product: {
      updateMany: vi.fn(),
    },
    order: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    orderStatusHistory: {
      create: vi.fn(),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (callback) => callback(tx)),
    order: {
      findMany: vi.fn(),
    },
  };

  const service = new OrderStockService(prisma as any);

  beforeEach(() => {
    vi.clearAllMocks();
    tx.$executeRaw.mockResolvedValue(1);
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    tx.order.create.mockResolvedValue({
      id: 'order-1',
      orderStatus: OrderStatus.pending,
    });
    tx.order.update.mockResolvedValue({ id: 'order-1' });
    tx.order.findFirst.mockResolvedValue(orderSnapshot(OrderStatus.pending));
    prisma.order.findMany.mockResolvedValue([]);
  });

  it('GIVEN a new order WHEN reserving stock SHOULD increment reserved stock and create the order atomically', async () => {
    const data = { tenant: { connect: { id: TENANT_ID } } };
    const items = [{ productId: 'prod-1', quantity: 2 }];

    await service.createOrderWithStockReservation(
      TENANT_ID,
      data as any,
      items,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.order.create).toHaveBeenCalledWith({ data });
    expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
      data: {
        orderId: 'order-1',
        status: OrderStatus.pending,
        note: 'Order created',
        changedBy: 'system',
      },
    });
  });

  it('GIVEN duplicate product lines WHEN reserving stock SHOULD aggregate quantities before reserving', async () => {
    await service.createOrderWithStockReservation(TENANT_ID, {} as any, [
      { productId: 'prod-1', quantity: 1 },
      { productId: 'prod-1', quantity: 2 },
    ]);

    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it('GIVEN stock changed after validation WHEN reserve cannot hold stock SHOULD reject without creating the order', async () => {
    tx.$executeRaw.mockResolvedValue(0);

    await expect(
      service.createOrderWithStockReservation(TENANT_ID, {} as any, [
        { productId: 'prod-1', quantity: 2 },
      ]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INSUFFICIENT_STOCK' }),
    });

    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('GIVEN a pending order WHEN status becomes rejected SHOULD release reserved stock once', async () => {
    await service.transitionOrderStatusById('order-1', TENANT_ID, {
      orderStatus: OrderStatus.rejected,
    });

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'prod-1',
        tenantId: TENANT_ID,
        reservedStock: { gte: 2 },
      },
      data: { reservedStock: { decrement: 2 } },
    });
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { orderStatus: OrderStatus.rejected },
    });
    expect(tx.orderStatusHistory.create).toHaveBeenCalledWith({
      data: {
        orderId: 'order-1',
        status: OrderStatus.rejected,
        note: undefined,
        changedBy: undefined,
      },
    });
  });

  it('GIVEN a rejected order WHEN the same rejected status arrives again SHOULD not restore stock again', async () => {
    tx.order.findFirst.mockResolvedValue(orderSnapshot(OrderStatus.rejected));

    await service.transitionOrderStatusById('order-1', TENANT_ID, {
      orderStatus: OrderStatus.rejected,
    });

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { orderStatus: OrderStatus.rejected },
    });
  });

  it('GIVEN a rejected order WHEN status moves back to paid SHOULD consume available stock with oversell guard', async () => {
    tx.order.findFirst.mockResolvedValue(orderSnapshot(OrderStatus.rejected));

    await service.transitionOrderStatusById('order-1', TENANT_ID, {
      orderStatus: OrderStatus.paid,
    });

    expect(tx.$executeRaw).toHaveBeenCalledOnce();
  });

  it('GIVEN a pending order WHEN status becomes paid SHOULD consume reserved stock', async () => {
    await service.transitionOrderStatusById('order-1', TENANT_ID, {
      orderStatus: OrderStatus.paid,
    });

    expect(tx.$executeRaw).toHaveBeenCalledOnce();
    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { orderStatus: OrderStatus.paid },
    });
  });

  it('GIVEN a paid order WHEN status becomes cancelled SHOULD restore consumed stock', async () => {
    tx.order.findFirst.mockResolvedValue(orderSnapshot(OrderStatus.paid));

    await service.transitionOrderStatusById('order-1', TENANT_ID, {
      orderStatus: OrderStatus.cancelled,
    });

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'prod-1', tenantId: TENANT_ID },
      data: { stock: { increment: 2 } },
    });
  });

  it('GIVEN shipped status without tracking WHEN updating SHOULD reject before mutation', async () => {
    await expect(
      service.transitionOrderStatusById('order-1', TENANT_ID, {
        orderStatus: OrderStatus.shipped,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ORDER_TRACKING_NUMBER_REQUIRED',
      }),
    });

    expect(tx.order.update).not.toHaveBeenCalled();
  });

  it('GIVEN stale pending reservations WHEN cron runs SHOULD expire matching orders', async () => {
    prisma.order.findMany.mockResolvedValue([
      { id: 'order-1', tenantId: TENANT_ID },
      { id: 'order-2', tenantId: TENANT_ID },
    ]);

    const expiredCount = await service.expirePendingReservations(15);

    expect(expiredCount).toBe(2);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orderStatus: OrderStatus.pending }),
        take: 100,
      }),
    );
    expect(tx.order.update).toHaveBeenCalledTimes(2);
  });
});

function orderSnapshot(orderStatus: OrderStatus) {
  return {
    id: 'order-1',
    tenantId: TENANT_ID,
    orderStatus,
    trackingNumber: null,
    items: [{ productId: 'prod-1', quantity: 2 }],
  };
}
