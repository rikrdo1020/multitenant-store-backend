import { ForbiddenException } from '@nestjs/common';
import {
  OrderStatus,
  ProductStatus,
  ShippingType,
  UserRole,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderItemIntegrityService } from './order-item-integrity.service';
import { OrderIntegrityService } from './order-integrity.service';
import { OrderPricingService } from './order-pricing.service';
import { OrderShippingIntegrityService } from './order-shipping-integrity.service';
import { OrderService } from './order.service';

describe('OrderService customer visibility', () => {
  const repo = {
    findMany: vi.fn(),
    count: vi.fn(),
    findById: vi.fn(),
    findByIdForCustomerEmail: vi.fn(),
    findByOrderId: vi.fn(),
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

  const itemIntegrity = new OrderItemIntegrityService(repo as any);
  const pricing = new OrderPricingService();
  const shipping = new OrderShippingIntegrityService(repo as any);
  const integrity = new OrderIntegrityService(
    repo as any,
    itemIntegrity,
    pricing,
    shipping,
  );
  const service = new OrderService(repo as any, integrity, stock as any);

  const adminUser = {
    sub: 'user-admin',
    email: 'admin@example.com',
    role: UserRole.admin,
    tenantId: 'tenant-1',
  };

  const customerUser = {
    sub: 'user-customer',
    email: 'Buyer@Example.com',
    role: UserRole.admin,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repo.findMany.mockResolvedValue([]);
    repo.count.mockResolvedValue(0);
    repo.hasTenantMembership.mockResolvedValue(null);
    repo.findActiveCombos.mockResolvedValue([]);
    repo.findProductsByIds.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Product',
        price: 5,
        discountPrice: null,
        stock: 10,
        productStatus: ProductStatus.published,
        type: null,
        images: [],
      },
    ]);
    repo.findActiveShippingMethodById.mockResolvedValue({
      id: 'ship-1',
      name: 'Delivery',
      type: ShippingType.delivery_zone,
      basePrice: 3,
      requiresDetails: false,
      disclaimer: null,
      logistics: [],
    });
  });

  it('GIVEN a tenant member WHEN listing orders SHOULD keep admin tenant-scoped access', async () => {
    repo.hasTenantMembership.mockResolvedValue({ id: 'member-1' });

    await service.findAllForUser('tenant-1', adminUser, {
      status: OrderStatus.pending,
    });

    expect(repo.findMany).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        status: OrderStatus.pending,
        customerId: undefined,
        search: undefined,
      },
      0,
      20,
    );
    expect(repo.count).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      status: OrderStatus.pending,
      customerId: undefined,
      search: undefined,
    });
  });

  it('GIVEN a non-member authenticated user WHEN listing orders SHOULD filter by their email', async () => {
    await service.findAllForUser('tenant-1', customerUser, {});

    expect(repo.findMany).toHaveBeenCalledWith(
      {
        tenantId: 'tenant-1',
        status: undefined,
        customerId: undefined,
        customerEmail: 'buyer@example.com',
        search: undefined,
      },
      0,
      20,
    );
  });

  it('GIVEN a non-member authenticated user WHEN reading detail SHOULD fetch only orders for their email', async () => {
    repo.findByIdForCustomerEmail.mockResolvedValue({
      id: 'order-1',
      orderId: 'ORD-1',
      orderStatus: OrderStatus.pending,
      total: 10,
      shippingCost: 0,
      customerData: { email: 'buyer@example.com' },
      shippingData: {},
      items: [],
      paymentMethod: 'pending',
      tenantId: 'tenant-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.findByIdForUser('order-1', 'tenant-1', customerUser);

    expect(repo.findByIdForCustomerEmail).toHaveBeenCalledWith(
      'order-1',
      'tenant-1',
      'buyer@example.com',
    );
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('GIVEN checkout customer data WHEN creating an order SHOULD upsert and connect the tenant customer', async () => {
    repo.upsertCustomerFromOrder.mockResolvedValue({ id: 'customer-1' });
    stock.createOrderWithStockReservation.mockImplementation(
      async (_tenantId, data) => ({
        id: 'order-1',
        ...data,
        orderStatus: OrderStatus.pending,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    await service.create('tenant-1', {
      customerData: {
        name: 'Buyer',
        email: 'Buyer@Example.com',
        phone: '+50760000000',
      },
      shippingData: {
        address: { address: 'Street 1', city: 'Panama' },
      },
      items: [
        { productId: 'prod-1', name: 'Product', quantity: 2, unitPrice: 5 },
      ],
      shippingMethodId: 'ship-1',
      shippingCost: 3,
      paymentMethod: 'pending',
    });

    expect(repo.upsertCustomerFromOrder).toHaveBeenCalledWith('tenant-1', {
      name: 'Buyer',
      email: 'buyer@example.com',
      phone: '+50760000000',
      address: 'Street 1',
      city: 'Panama',
    });
    expect(stock.createOrderWithStockReservation).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        total: 13,
        customerData: {
          name: 'Buyer',
          email: 'buyer@example.com',
          phone: '+50760000000',
        },
        customer: { connect: { id: 'customer-1' } },
      }),
      expect.any(Array),
    );
  });

  it('GIVEN a non-member authenticated user WHEN updating status SHOULD reject the mutation', async () => {
    await expect(
      service.updateStatusForUser('order-1', 'tenant-1', customerUser, {
        orderStatus: OrderStatus.paid,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(stock.transitionOrderStatusById).not.toHaveBeenCalled();
  });
});
