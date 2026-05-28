import * as crypto from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebhookService } from './webhook.service';

const TENANT_ID = 'tenant-1';

const SECRET_KEY = Buffer.from('test-secret').toString('base64');

function makeHash(orderId: string, status: string, domain: string): string {
  return crypto
    .createHmac('sha256', 'test-secret')
    .update(orderId + status + domain)
    .digest('hex');
}

function makeConfigService(secretKey = SECRET_KEY) {
  return {
    get: (key: string, def = '') =>
      key === 'YAPPY_SECRET_KEY' ? secretKey : def,
  } as any;
}

function makePrisma() {
  return {
    order: {
      findFirst: vi.fn().mockResolvedValue({ id: 'order-db-id' }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  } as any;
}

function makeOrderStockService() {
  return {
    transitionOrderStatusByOrderId: vi
      .fn()
      .mockResolvedValue({ id: 'order-db-id', orderStatus: OrderStatus.paid }),
  };
}

function makeOrderEmailService() {
  return {
    sendOrderStatusNotification: vi.fn().mockResolvedValue(undefined),
  };
}

describe('WebhookService - handleYappy', () => {
  let service: WebhookService;
  let prisma: ReturnType<typeof makePrisma>;
  let stock: ReturnType<typeof makeOrderStockService>;
  let emails: ReturnType<typeof makeOrderEmailService>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    stock = makeOrderStockService();
    emails = makeOrderEmailService();
    service = new WebhookService(makeConfigService(), stock as any, emails as any);
  });

  it('throws UnauthorizedException when hash is invalid', async () => {
    await expect(
      service.handleYappy({
        orderId: 'ORD-1',
        status: 'E',
        domain: 'test.com',
        hash: 'badhash',
      }),
    ).rejects.toThrow(UnauthorizedException);

    expect(stock.transitionOrderStatusByOrderId).not.toHaveBeenCalled();
    expect(emails.sendOrderStatusNotification).not.toHaveBeenCalled();
  });

  it('updates order status to paid for status "E"', async () => {
    const hash = makeHash('1', 'E', 'test.com');

    await service.handleYappy({
      orderId: '1',
      status: 'E',
      domain: 'test.com',
      hash,
    });

    expect(stock.transitionOrderStatusByOrderId).toHaveBeenCalledWith(
      'ORD-1',
      undefined,
      {
        orderStatus: OrderStatus.paid,
      },
    );
    expect(emails.sendOrderStatusNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-db-id' }),
    );
  });

  it('updates order status to rejected for status "R"', async () => {
    const hash = makeHash('2', 'R', 'test.com');

    await service.handleYappy({
      orderId: '2',
      status: 'R',
      domain: 'test.com',
      hash,
    });

    expect(stock.transitionOrderStatusByOrderId).toHaveBeenCalledWith(
      'ORD-2',
      undefined,
      {
        orderStatus: OrderStatus.rejected,
      },
    );
  });

  it('updates order status to cancelled for status "C"', async () => {
    const hash = makeHash('3', 'C', 'test.com');

    await service.handleYappy({
      orderId: '3',
      status: 'C',
      domain: 'test.com',
      hash,
    });

    expect(stock.transitionOrderStatusByOrderId).toHaveBeenCalledWith(
      'ORD-3',
      undefined,
      {
        orderStatus: OrderStatus.cancelled,
      },
    );
  });

  it('updates order status to expired for status "X"', async () => {
    const hash = makeHash('4', 'X', 'test.com');

    await service.handleYappy({
      orderId: '4',
      status: 'X',
      domain: 'test.com',
      hash,
    });

    expect(stock.transitionOrderStatusByOrderId).toHaveBeenCalledWith(
      'ORD-4',
      undefined,
      {
        orderStatus: OrderStatus.expired,
      },
    );
  });

  it('falls back to pending for unknown status code', async () => {
    const hash = makeHash('5', 'Z', 'test.com');

    await service.handleYappy({
      orderId: '5',
      status: 'Z',
      domain: 'test.com',
      hash,
    });

    expect(stock.transitionOrderStatusByOrderId).toHaveBeenCalledWith(
      'ORD-5',
      undefined,
      {
        orderStatus: OrderStatus.pending,
      },
    );
  });
});

describe('WebhookService - handleStripe', () => {
  let service: WebhookService;
  let prisma: ReturnType<typeof makePrisma>;
  let stock: ReturnType<typeof makeOrderStockService>;
  let emails: ReturnType<typeof makeOrderEmailService>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrisma();
    stock = makeOrderStockService();
    emails = makeOrderEmailService();
    service = new WebhookService(makeConfigService(), stock as any, emails as any);
  });

  it('marks order paid on payment_intent.succeeded', async () => {
    await service.handleStripe(
      {
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_123', metadata: { orderId: 'ORD-9' } } },
      },
      TENANT_ID,
    );

    expect(stock.transitionOrderStatusByOrderId).toHaveBeenCalledWith(
      'ORD-9',
      TENANT_ID,
      {
        orderStatus: OrderStatus.paid,
        transactionId: 'pi_123',
      },
    );
    expect(emails.sendOrderStatusNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-db-id' }),
    );
  });

  it('marks order failed on payment_intent.payment_failed', async () => {
    await service.handleStripe(
      {
        type: 'payment_intent.payment_failed',
        data: { object: { metadata: { orderId: 'ORD-9' } } },
      },
      TENANT_ID,
    );

    expect(stock.transitionOrderStatusByOrderId).toHaveBeenCalledWith(
      'ORD-9',
      TENANT_ID,
      {
        orderStatus: OrderStatus.failed,
      },
    );
  });
});
