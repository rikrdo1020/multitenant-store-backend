import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IPaymentProvider } from './interfaces/payment-provider.interface';
import { CashProvider } from './providers/cash.provider';
import { YappyProvider } from './providers/yappy.provider';
import { PaymentService } from './payment.service';

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

  beforeEach(() => {
    yappyProvider = makeProvider('yappy') as unknown as YappyProvider;
    cashProvider = makeProvider('cash') as unknown as CashProvider;
    service = new PaymentService(yappyProvider, cashProvider);
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
      expect(() => service.getProvider('stripe')).toThrow('"stripe" is not supported');
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
        service.createPayment('paypal', { orderId: 'x', amount: 1, tenantId: 't' }),
      ).rejects.toThrow('not supported');
    });
  });
});
