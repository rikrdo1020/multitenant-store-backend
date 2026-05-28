import { BadRequestException } from '@nestjs/common';
import { OrderStatus, ProductStatus, ShippingType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderItemIntegrityService } from './order-item-integrity.service';
import { OrderIntegrityService } from './order-integrity.service';
import { OrderPricingService } from './order-pricing.service';
import { OrderShippingIntegrityService } from './order-shipping-integrity.service';
import { OrderService } from './order.service';

describe('OrderService order integrity', () => {
  const repo = {
    findMany: vi.fn(),
    count: vi.fn(),
    findById: vi.fn(),
    findByIdForCustomerEmail: vi.fn(),
    findByOrderIdAndViewTokenHash: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findCustomerById: vi.fn(),
    upsertCustomerFromOrder: vi.fn(),
    hasTenantMembership: vi.fn(),
    findProductsByIds: vi.fn(),
    findActiveShippingMethodById: vi.fn(),
    findActiveCombos: vi.fn(),
  };
  const stock = {
    createOrderWithStockReservation: vi.fn(),
    transitionOrderStatusById: vi.fn(),
  };
  const emails = {
    sendOrderCreated: vi.fn(),
    sendOrderStatusNotification: vi.fn(),
  };

  const itemIntegrity = new OrderItemIntegrityService(repo as any);
  const pricing = new OrderPricingService();
  const shipping = new OrderShippingIntegrityService(repo as any);
  const integrity = new OrderIntegrityService(
    repo as any,
    itemIntegrity,
    pricing,
    shipping,
  );
  const service = new OrderService(repo as any, integrity, stock as any, emails as any);

  beforeEach(() => {
    vi.clearAllMocks();
    repo.upsertCustomerFromOrder.mockResolvedValue({ id: 'customer-1' });
    repo.findProductsByIds.mockResolvedValue([publishedProduct()]);
    repo.findActiveShippingMethodById.mockResolvedValue(activeShippingMethod());
    repo.findActiveCombos.mockResolvedValue([]);
    emails.sendOrderCreated.mockResolvedValue(undefined);
    stock.createOrderWithStockReservation.mockImplementation(
      async (_tenantId, data) => ({
        id: 'order-1',
        ...data,
        orderStatus: OrderStatus.pending,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
  });

  it('GIVEN manipulated item and shipping prices WHEN creating an order SHOULD recalculate totals from backend data', async () => {
    await service.create(
      'tenant-1',
      createOrderDto({
        items: [
          { productId: 'prod-1', name: 'Fake Name', quantity: 2, unitPrice: 1 },
        ],
        shippingCost: 0,
      }),
    );

    expect(repo.findProductsByIds).toHaveBeenCalledWith(['prod-1'], 'tenant-1');
    expect(repo.findActiveShippingMethodById).toHaveBeenCalledWith(
      'ship-1',
      'tenant-1',
    );
    expect(stock.createOrderWithStockReservation).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        total: 207.48,
        shippingCost: 7.5,
        items: [
          expect.objectContaining({
            productId: 'prod-1',
            name: 'Wireless Headphones Pro',
            quantity: 2,
            unitPrice: 99.99,
            imageUrl: 'https://cdn.test/headphones.jpg',
          }),
        ],
      }),
      expect.any(Array),
    );
  });

  it('GIVEN a product outside the tenant WHEN creating an order SHOULD reject the order', async () => {
    repo.findProductsByIds.mockResolvedValue([]);

    await expect(
      service.create('tenant-1', createOrderDto()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ORDER_PRODUCT_NOT_FOUND' }),
    });

    expect(stock.createOrderWithStockReservation).not.toHaveBeenCalled();
  });

  it('GIVEN an unpublished product WHEN creating an order SHOULD reject the order', async () => {
    repo.findProductsByIds.mockResolvedValue([
      publishedProduct({ productStatus: ProductStatus.draft }),
    ]);

    await expect(
      service.create('tenant-1', createOrderDto()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ORDER_PRODUCT_UNAVAILABLE' }),
    });

    expect(stock.createOrderWithStockReservation).not.toHaveBeenCalled();
  });

  it('GIVEN requested quantity exceeds stock WHEN creating an order SHOULD reject the order', async () => {
    repo.findProductsByIds.mockResolvedValue([publishedProduct({ stock: 1 })]);

    await expect(
      service.create(
        'tenant-1',
        createOrderDto({
          items: [
            {
              productId: 'prod-1',
              name: 'Wireless Headphones Pro',
              quantity: 2,
              unitPrice: 99.99,
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ORDER_INSUFFICIENT_STOCK' }),
    });

    expect(stock.createOrderWithStockReservation).not.toHaveBeenCalled();
  });

  it('GIVEN the same product appears in multiple cart lines WHEN aggregate quantity exceeds stock SHOULD reject the order', async () => {
    repo.findProductsByIds.mockResolvedValue([publishedProduct({ stock: 2 })]);

    await expect(
      service.create(
        'tenant-1',
        createOrderDto({
          items: [
            {
              productId: 'prod-1',
              name: 'Wireless Headphones Pro',
              quantity: 1,
              unitPrice: 99.99,
              selectedOptions: { Color: 'Black' },
            },
            {
              productId: 'prod-1',
              name: 'Wireless Headphones Pro',
              quantity: 2,
              unitPrice: 99.99,
              selectedOptions: { Color: 'Silver' },
            },
          ],
        }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ORDER_INSUFFICIENT_STOCK' }),
    });

    expect(stock.createOrderWithStockReservation).not.toHaveBeenCalled();
  });

  it('GIVEN an inactive shipping method WHEN creating an order SHOULD reject the order', async () => {
    repo.findActiveShippingMethodById.mockResolvedValue(null);

    await expect(
      service.create('tenant-1', createOrderDto()),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ORDER_SHIPPING_METHOD_INVALID',
      }),
    });

    expect(stock.createOrderWithStockReservation).not.toHaveBeenCalled();
  });

  it('GIVEN an invalid shipping location WHEN creating an order SHOULD reject the order', async () => {
    await expect(
      service.create(
        'tenant-1',
        createOrderDto({ shippingLocationId: 'loc-missing' }),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ORDER_SHIPPING_LOCATION_INVALID',
      }),
    });

    expect(stock.createOrderWithStockReservation).not.toHaveBeenCalled();
  });

  it('GIVEN selected options WHEN creating an order SHOULD preserve them in the trusted item snapshot', async () => {
    await service.create(
      'tenant-1',
      createOrderDto({
        items: [
          {
            productId: 'prod-1',
            name: 'Wireless Headphones Pro',
            quantity: 1,
            unitPrice: 99.99,
            selectedOptions: { Color: 'Black' },
          },
        ],
      }),
    );

    expect(stock.createOrderWithStockReservation).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        items: [
          expect.objectContaining({
            selectedOptions: { Color: 'Black' },
          }),
        ],
      }),
      expect.any(Array),
    );
  });

  it('GIVEN an active combo WHEN creating an order SHOULD apply combo-aware pricing server-side', async () => {
    repo.findActiveCombos.mockResolvedValue([
      {
        id: 'combo-1',
        price: 150,
        isActive: true,
        rules: [{ productType: 'audio', quantity: 2 }],
      },
    ]);

    await service.create(
      'tenant-1',
      createOrderDto({
        items: [
          { productId: 'prod-1', name: 'Fake Name', quantity: 2, unitPrice: 1 },
        ],
        shippingCost: 0,
      }),
    );

    expect(stock.createOrderWithStockReservation).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        total: 157.5,
        shippingCost: 7.5,
      }),
      expect.any(Array),
    );
  });

  it('GIVEN an empty cart WHEN creating an order SHOULD reject the order', async () => {
    await expect(
      service.create('tenant-1', createOrderDto({ items: [] })),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(stock.createOrderWithStockReservation).not.toHaveBeenCalled();
  });
});

function createOrderDto(
  overrides: Partial<CreateOrderDto> = {},
): CreateOrderDto {
  return {
    customerData: {
      name: 'Buyer',
      email: 'Buyer@Example.com',
      phone: '+50760000000',
    },
    shippingData: {
      address: { address: 'Street 1', city: 'Panama' },
      method: {
        documentId: 'ship-1',
        name: 'Delivery',
        type: ShippingType.delivery_zone,
      },
      location: { documentId: 'loc-1', key: 'panama', label: 'Panama City' },
    },
    items: [
      {
        productId: 'prod-1',
        name: 'Wireless Headphones Pro',
        quantity: 1,
        unitPrice: 99.99,
      },
    ],
    shippingMethodId: 'ship-1',
    shippingLocationId: 'loc-1',
    shippingCost: 7.5,
    paymentMethod: 'pending',
    ...overrides,
  };
}

function publishedProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    name: 'Wireless Headphones Pro',
    price: 129.99,
    discountPrice: 99.99,
    stock: 10,
    productStatus: ProductStatus.published,
    type: 'audio',
    images: ['https://cdn.test/headphones.jpg'],
    ...overrides,
  };
}

function activeShippingMethod(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ship-1',
    name: 'Delivery',
    type: ShippingType.delivery_zone,
    basePrice: 5,
    requiresDetails: true,
    disclaimer: null,
    logistics: [
      { id: 'loc-1', key: 'panama', label: 'Panama City', extraPrice: 2.5 },
    ],
    ...overrides,
  };
}
