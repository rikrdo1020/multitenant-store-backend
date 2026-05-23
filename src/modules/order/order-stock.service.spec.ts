import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStockService } from './order-stock.service';

const TENANT_ID = 'tenant-1';

describe('OrderStockService', () => {
  const tx = {
    product: {
      updateMany: vi.fn(),
    },
    order: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  };

  const prisma = {
    $transaction: vi.fn(async (callback) => callback(tx)),
  };

  const service = new OrderStockService(prisma as any);

  beforeEach(() => {
    vi.clearAllMocks();
    tx.product.updateMany.mockResolvedValue({ count: 1 });
    tx.order.create.mockResolvedValue({
      id: 'order-1',
      orderStatus: OrderStatus.pending,
    });
    tx.order.update.mockResolvedValue({ id: 'order-1' });
    tx.order.findFirst.mockResolvedValue(orderSnapshot(OrderStatus.pending));
  });

  it('GIVEN a new order WHEN reserving stock SHOULD decrement stock and create the order atomically', async () => {
    const data = { tenant: { connect: { id: TENANT_ID } } };
    const items = [{ productId: 'prod-1', quantity: 2 }];

    await service.createOrderWithStockReservation(
      TENANT_ID,
      data as any,
      items,
    );

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'prod-1',
        tenantId: TENANT_ID,
        stock: { gte: 2 },
        productStatus: 'published',
      },
      data: { stock: { decrement: 2 } },
    });
    expect(tx.order.create).toHaveBeenCalledWith({ data });
  });

  it('GIVEN duplicate product lines WHEN reserving stock SHOULD aggregate quantities before decrementing', async () => {
    await service.createOrderWithStockReservation(TENANT_ID, {} as any, [
      { productId: 'prod-1', quantity: 1 },
      { productId: 'prod-1', quantity: 2 },
    ]);

    expect(tx.product.updateMany).toHaveBeenCalledOnce();
    expect(tx.product.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'prod-1', stock: { gte: 3 } }),
        data: { stock: { decrement: 3 } },
      }),
    );
  });

  it('GIVEN stock changed after validation WHEN reserve cannot decrement SHOULD reject without creating the order', async () => {
    tx.product.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.createOrderWithStockReservation(TENANT_ID, {} as any, [
        { productId: 'prod-1', quantity: 2 },
      ]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ORDER_INSUFFICIENT_STOCK' }),
    });

    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('GIVEN a pending order WHEN status becomes rejected SHOULD restore stock once', async () => {
    await service.transitionOrderStatusById('order-1', TENANT_ID, {
      orderStatus: OrderStatus.rejected,
    });

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'prod-1', tenantId: TENANT_ID },
      data: { stock: { increment: 2 } },
    });
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { orderStatus: OrderStatus.rejected },
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

  it('GIVEN a rejected order WHEN status moves back to paid SHOULD reserve stock again with oversell guard', async () => {
    tx.order.findFirst.mockResolvedValue(orderSnapshot(OrderStatus.rejected));

    await service.transitionOrderStatusById('order-1', TENANT_ID, {
      orderStatus: OrderStatus.paid,
    });

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'prod-1',
        tenantId: TENANT_ID,
        stock: { gte: 2 },
        productStatus: 'published',
      },
      data: { stock: { decrement: 2 } },
    });
  });

  it('GIVEN a pending order WHEN status becomes paid SHOULD keep stock reserved without extra stock updates', async () => {
    await service.transitionOrderStatusById('order-1', TENANT_ID, {
      orderStatus: OrderStatus.paid,
    });

    expect(tx.product.updateMany).not.toHaveBeenCalled();
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { orderStatus: OrderStatus.paid },
    });
  });
});

function orderSnapshot(orderStatus: OrderStatus) {
  return {
    id: 'order-1',
    tenantId: TENANT_ID,
    orderStatus,
    items: [{ productId: 'prod-1', quantity: 2 }],
  };
}
