import { describe, expect, it, vi } from 'vitest';
import { PaymentController } from './payment.controller';

describe('PaymentController', () => {
  it('GIVEN provider and order payload WHEN creating payment SHOULD delegate to payment service with tenant scope', async () => {
    const result = { success: true, transactionId: 'TXN-1' };
    const service = {
      createPaymentForOrder: vi.fn().mockResolvedValue(result),
    };
    const controller = new PaymentController(service as any);

    await expect(
      controller.create(
        'yappy',
        { orderId: 'ORD-001', amount: 75, aliasYappy: '6789-1234' },
        { id: 'tenant-1' } as any,
      ),
    ).resolves.toBe(result);

    expect(service.createPaymentForOrder).toHaveBeenCalledWith(
      'yappy',
      { orderId: 'ORD-001', amount: 75, aliasYappy: '6789-1234' },
      'tenant-1',
    );
  });
});
