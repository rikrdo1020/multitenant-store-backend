import { BadRequestException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentController } from './payment.controller';

const mockOrder = { id: 'id-1', orderId: 'ORD-001', total: '75.00', tenantId: 'tenant-1' };
const mockTenant = { id: 'tenant-1' };

function makePrisma(order = mockOrder) {
  return {
    order: {
      findFirst: vi.fn().mockResolvedValue(order),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

function makePaymentService(result = { transactionId: 'TXN-1', documentName: 'DOC-1' }) {
  return { createPayment: vi.fn().mockResolvedValue(result) };
}

function makeConfigService(yappyMock = 'false') {
  return { get: vi.fn().mockReturnValue(yappyMock) };
}

describe('PaymentController', () => {
  describe('create', () => {
    it('throws when order not found', async () => {
      const prisma = makePrisma(null as any);
      const controller = new PaymentController(makePaymentService() as any, prisma as any, makeConfigService() as any);

      await expect(
        controller.create('yappy', { orderId: 'MISSING', amount: 50 }, mockTenant as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('returns payment result', async () => {
      const prisma = makePrisma();
      const service = makePaymentService({ transactionId: 'TXN-ABC', documentName: 'DOC-X' });
      const controller = new PaymentController(service as any, prisma as any, makeConfigService() as any);

      const res = await controller.create('yappy', { orderId: 'ORD-001', amount: 75 }, mockTenant as any);

      expect(res).toEqual({ success: true, transactionId: 'TXN-ABC', documentName: 'DOC-X' });
    });

    it('marks order paid immediately for cash', async () => {
      const prisma = makePrisma();
      const service = makePaymentService({ transactionId: undefined, documentName: undefined });
      const controller = new PaymentController(service as any, prisma as any, makeConfigService() as any);

      await controller.create('cash', { orderId: 'ORD-001', amount: 75 }, mockTenant as any);

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'ORD-001', tenantId: 'tenant-1' },
        data: { orderStatus: OrderStatus.paid },
      });
    });

    it('simulates webhook and marks order paid when YAPPY_MOCK=true', async () => {
      const prisma = makePrisma();
      const service = makePaymentService({ transactionId: 'MOCK-TXN-1', documentName: 'MOCK-DOC-1' });
      const controller = new PaymentController(service as any, prisma as any, makeConfigService('true') as any);

      await controller.create('yappy', { orderId: 'ORD-001', amount: 75 }, mockTenant as any);

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: { orderId: 'ORD-001', tenantId: 'tenant-1' },
        data: { orderStatus: OrderStatus.paid, transactionId: 'MOCK-TXN-1' },
      });
    });

    it('skips order update for real Yappy (no mock)', async () => {
      const prisma = makePrisma();
      const service = makePaymentService({ transactionId: 'TXN-1', documentName: 'DOC-1' });
      const controller = new PaymentController(service as any, prisma as any, makeConfigService() as any);

      await controller.create('yappy', { orderId: 'ORD-001', amount: 75 }, mockTenant as any);

      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('passes aliasYappy to service', async () => {
      const prisma = makePrisma();
      const service = makePaymentService();
      const controller = new PaymentController(service as any, prisma as any, makeConfigService() as any);

      await controller.create('yappy', { orderId: 'ORD-001', amount: 75, aliasYappy: '6789-1234' }, mockTenant as any);

      expect(service.createPayment).toHaveBeenCalledWith(
        'yappy',
        expect.objectContaining({ aliasYappy: '6789-1234' }),
      );
    });
  });
});
