import { describe, expect, it } from 'vitest';
import { OrderPricingService } from './order-pricing.service';

describe('OrderPricingService', () => {
  const service = new OrderPricingService();

  it('GIVEN no combos WHEN calculating pricing SHOULD return regular subtotal', () => {
    const result = service.calculate([
      { quantity: 2, unitPrice: 10, type: 'audio' },
      { quantity: 1, unitPrice: 5, type: 'accessory' },
    ]);

    expect(result).toEqual({
      originalSubtotal: 25,
      subtotal: 25,
      savings: 0,
    });
  });

  it('GIVEN an active combo WHEN it lowers the total SHOULD apply the combo discount', () => {
    const result = service.calculate(
      [{ quantity: 2, unitPrice: 99.99, type: 'audio' }],
      [
        {
          id: 'combo-1',
          price: 150,
          isActive: true,
          rules: [{ productType: 'audio', quantity: 2 }],
        },
      ],
    );

    expect(result).toEqual({
      originalSubtotal: 199.98,
      subtotal: 150,
      savings: 49.98,
    });
  });

  it('GIVEN a non-saving combo WHEN calculating pricing SHOULD ignore it', () => {
    const result = service.calculate(
      [{ quantity: 2, unitPrice: 10, type: 'audio' }],
      [
        {
          id: 'combo-1',
          price: 25,
          isActive: true,
          rules: [{ productType: 'audio', quantity: 2 }],
        },
      ],
    );

    expect(result).toEqual({
      originalSubtotal: 20,
      subtotal: 20,
      savings: 0,
    });
  });

  it('GIVEN multiple eligible combos WHEN calculating pricing SHOULD choose the best savings', () => {
    const result = service.calculate(
      [
        { quantity: 2, unitPrice: 40, type: 'audio' },
        { quantity: 1, unitPrice: 20, type: 'accessory' },
      ],
      [
        {
          id: 'combo-audio',
          price: 70,
          isActive: true,
          rules: [{ productType: 'audio', quantity: 2 }],
        },
        {
          id: 'combo-bundle',
          price: 80,
          isActive: true,
          rules: [
            { productType: 'audio', quantity: 2 },
            { productType: 'accessory', quantity: 1 },
          ],
        },
      ],
    );

    expect(result).toEqual({
      originalSubtotal: 100,
      subtotal: 80,
      savings: 20,
    });
  });

  it('GIVEN many eligible items WHEN applying one combo SHOULD cap applications at five', () => {
    const result = service.calculate(
      [{ quantity: 12, unitPrice: 10, type: 'audio' }],
      [
        {
          id: 'combo-1',
          price: 15,
          isActive: true,
          rules: [{ productType: 'audio', quantity: 2 }],
        },
      ],
    );

    expect(result).toEqual({
      originalSubtotal: 120,
      subtotal: 95,
      savings: 25,
    });
  });
});
