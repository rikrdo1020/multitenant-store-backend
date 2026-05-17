import { describe, expect, it } from 'vitest';
import { CashProvider } from './cash.provider';

describe('CashProvider', () => {
  const provider = new CashProvider();

  it('name is "cash"', () => {
    expect(provider.name).toBe('cash');
  });

  it('createPayment resolves with no transactionId', async () => {
    const result = await provider.createPayment({
      orderId: 'ORD-001',
      amount: 25,
      tenantId: 'tenant-1',
    });

    expect(result.transactionId).toBeUndefined();
    expect(result.documentName).toBeUndefined();
  });
});
