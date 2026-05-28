import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IPaymentProvider } from './interfaces/payment-provider.interface';
import { CashProvider } from './providers/cash.provider';
import { YappyProvider } from './providers/yappy.provider';
import { PaymentService } from './payment.service';
import { hashOrderViewToken } from '../order/order-view-token';

function makeProvider(name: string): IPaymentProvider {
  return {
    name,
    createPayment: vi.fn().mockResolvedValue({}),
  };
}

describe('PaymentService', () => {
  let service: PaymentService;
  let yappyProvider: YappyProvider;
  let cashProvider: CashProvider;
  let orders: ReturnType<typeof makeOrderRepository>;
  let stock: ReturnType<typeof makeOrderStockService>;
  let config: ReturnType<typeof makeConfigService>;
  let emails: ReturnType<typeof makeOrderEmailService>;

  beforeEach(() => {
    yappyProvider = makeProvider('yappy') as unknown as YappyProvider;
    cashProvider = makeProvider('cash') as unknown as CashProvider;
    orders = makeOrderRepository();
    stock = makeOrderStockService();
    config = makeConfigService();
    emails = makeOrderEmailService();
    service = new PaymentService(
      yappyProvider,
      cashProvider,
      orders as any,
      config as any,
      stock as any,
      emails as any,
    );
  });

  describe('getProvider', () => {
    it('returns yappy provider', () => {
      expect(service.getProvider('yappy')).toBe(yappyProvider);
    });

    it('returns cash provider', () => {
      expect(service.getProvider('cash')).toBe(cashProvider);
    });

    it('throws for unknown provider', () => {
      expect(() => service.getProvider('stripe')).toThrow(BadRequestException);
      expect(() => service.getProvider('stripe')).toThrow(
        '"stripe" is not supported',
      );
    });
  });

  describe('createPayment', () => {
    it('delegates to yappy provider', async () => {
      const params = { orderId: 'ORD-1', amount: 100, tenantId: 't-1' };
      await service.createPayment('yappy', params);
      expect(yappyProvider.createPayment).toHaveBeenCalledWith(params);
    });

    it('delegates to cash provider', async () => {
      const params = { orderId: 'ORD-2', amount: 50, tenantId: 't-1' };
      await service.createPayment('cash', params);
      expect(cashProvider.createPayment).toHaveBeenCalledWith(params);
    });

    it('throws for unsupported provider', async () => {
      await expect(
        service.createPayment('paypal', {
          orderId: 'x',
          amount: 1,
          tenantId: 't',
        }),
      ).rejects.toThrow('not supported');
    });
  });

  describe('createPaymentForOrder', () => {
    it('throws when order does not exist for tenant', async () => {
      orders.findByOrderIdAndViewTokenHash.mockResolvedValue(null);

      await expect(
        service.createPaymentForOrder(
          'yappy',
          { orderId: 'MISSING', amount: 50, viewToken: 'view-token' },
          'tenant-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires the public view token to find the order', async () => {
      await service.createPaymentForOrder(
        'yappy',
        { orderId: 'ORD-001', amount: 1, viewToken: 'view-token' },
        'tenant-1',
      );

      expect(orders.findByOrderIdAndViewTokenHash).toHaveBeenCalledWith(
        'ORD-001',
        'tenant-1',
        hashOrderViewToken('view-token'),
      );
    });

    it('uses persisted order total instead of client amount', async () => {
      await service.createPaymentForOrder(
        'yappy',
        { orderId: 'ORD-001', amount: 1, viewToken: 'view-token' },
        'tenant-1',
      );

      expect(yappyProvider.createPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: 'ORD-001',
          amount: 75,
          tenantId: 'tenant-1',
        }),
      );
      expect(stock.transitionOrderStatusByOrderId).not.toHaveBeenCalled();
    });

    it('marks cash order paid through stock lifecycle service', async () => {
      await service.createPaymentForOrder(
        'cash',
        { orderId: 'ORD-001', amount: 75, viewToken: 'view-token' },
        'tenant-1',
      );

      expect(stock.transitionOrderStatusByOrderId).toHaveBeenCalledWith(
        'ORD-001',
        'tenant-1',
        {
          orderStatus: OrderStatus.paid,
        },
      );
      expect(emails.sendOrderStatusNotification).toHaveBeenCalledWith({
        id: 'order-1',
      });
    });

    it('marks Yappy mock order paid through stock lifecycle service', async () => {
      config.get.mockReturnValue('true');
      (yappyProvider.createPayment as any).mockResolvedValue({
        transactionId: 'MOCK-TXN-1',
      });

      await service.createPaymentForOrder(
        'yappy',
        { orderId: 'ORD-001', amount: 75, viewToken: 'view-token' },
        'tenant-1',
      );

      expect(stock.transitionOrderStatusByOrderId).toHaveBeenCalledWith(
        'ORD-001',
        'tenant-1',
        {
          orderStatus: OrderStatus.paid,
          transactionId: 'MOCK-TXN-1',
        },
      );
      expect(emails.sendOrderStatusNotification).toHaveBeenCalledWith({
        id: 'order-1',
      });
    });
  });
});

function makeOrderRepository() {
  return {
    findByOrderIdAndViewTokenHash: vi.fn().mockResolvedValue({
      id: 'id-1',
      orderId: 'ORD-001',
      total: '75.00',
      tenantId: 'tenant-1',
    }),
  };
}

function makeConfigService() {
  return { get: vi.fn().mockReturnValue('false') };
}

function makeOrderStockService() {
  return {
    transitionOrderStatusByOrderId: vi
      .fn()
      .mockResolvedValue({ id: 'order-1' }),
  };
}

function makeOrderEmailService() {
  return {
    sendOrderStatusNotification: vi.fn().mockResolvedValue(undefined),
  };
}
