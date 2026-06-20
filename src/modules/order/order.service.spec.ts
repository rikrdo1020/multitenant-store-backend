import { ForbiddenException } from '@nestjs/common';
import { createHash } from 'crypto';
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
    findRecent: vi.fn(),
    findById: vi.fn(),
    findByIdForCustomerEmail: vi.fn(),
    findByOrderIdAndViewTokenHash: vi.fn(),
    findByViewTokenHash: vi.fn(),
    findByOrderIdAndCustomerEmail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    findCustomerById: vi.fn(),
    upsertCustomerFromOrder: vi.fn(),
    hasTenantMembership: vi.fn(),
    findProductsByIds: vi.fn(),
    findProductTenantIdsByIds: vi.fn(),
    findActiveShippingMethodById: vi.fn(),
    findActiveCombos: vi.fn(),
    findTenantPricingSettings: vi.fn(),
    findTenantMemberUserIds: vi.fn().mockResolvedValue([]),
  };

  const stock = {
    createOrderWithStockReservation: vi.fn(),
    transitionOrderStatusById: vi.fn(),
  };
  const emails = {
    sendOrderCreated: vi.fn(),
    sendOrderStatusNotification: vi.fn(),
  };
  const notifications = { send: vi.fn().mockResolvedValue(undefined) };

  const itemIntegrity = new OrderItemIntegrityService(repo as any);
  const pricing = new OrderPricingService();
  const shipping = new OrderShippingIntegrityService(repo as any);
  const integrity = new OrderIntegrityService(
    repo as any,
    itemIntegrity,
    pricing,
    shipping,
  );
  const service = new OrderService(
    repo as any,
    integrity,
    stock as any,
    emails as any,
    notifications as any,
  );

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
    repo.findRecent.mockResolvedValue([]);
    repo.hasTenantMembership.mockResolvedValue(null);
    repo.findActiveCombos.mockResolvedValue([]);
    repo.findProductTenantIdsByIds.mockResolvedValue([]);
    repo.findTenantPricingSettings.mockResolvedValue({ taxRate: 0 });
    emails.sendOrderCreated.mockResolvedValue(undefined);
    emails.sendOrderStatusNotification.mockResolvedValue(undefined);
    repo.findProductsByIds.mockResolvedValue([
      {
        id: 'prod-1',
        tenantId: 'tenant-1',
        name: 'Product',
        price: 5,
        discountPrice: null,
        stock: 10,
        reservedStock: 0,
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

  it('GIVEN tenant orders WHEN loading recent orders SHOULD return compact operational rows', async () => {
    repo.findRecent.mockResolvedValue([
      {
        id: 'order-1',
        orderId: 'ORD-1',
        total: 35.5,
        orderStatus: OrderStatus.ready,
        paymentMethod: 'cash',
        customerData: { name: 'Fallback Buyer', email: 'fallback@example.com' },
        customer: { name: 'Buyer', email: 'buyer@example.com' },
        createdAt: new Date('2026-06-01T10:00:00Z'),
      },
      {
        id: 'order-2',
        orderId: 'ORD-2',
        total: 20,
        orderStatus: OrderStatus.pending,
        paymentMethod: 'yappy',
        customerData: { name: 'Guest', email: 'guest@example.com' },
        customer: null,
        createdAt: new Date('2026-06-01T09:00:00Z'),
      },
    ]);

    const result = await service.findRecent('tenant-1', 5);

    expect(repo.findRecent).toHaveBeenCalledWith('tenant-1', 5);
    expect(result).toEqual([
      {
        documentId: 'order-1',
        orderId: 'ORD-1',
        orderNumber: 'ORD-1',
        customer: { name: 'Buyer', email: 'buyer@example.com' },
        total: 35.5,
        status: OrderStatus.ready,
        orderStatus: OrderStatus.ready,
        paymentStatus: 'paid',
        paymentMethod: 'cash',
        createdAt: new Date('2026-06-01T10:00:00Z'),
      },
      {
        documentId: 'order-2',
        orderId: 'ORD-2',
        orderNumber: 'ORD-2',
        customer: { name: 'Guest', email: 'guest@example.com' },
        total: 20,
        status: OrderStatus.pending,
        orderStatus: OrderStatus.pending,
        paymentStatus: 'pending',
        paymentMethod: 'yappy',
        createdAt: new Date('2026-06-01T09:00:00Z'),
      },
    ]);
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

    const result = (await service.create('tenant-1', {
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
    })) as Record<string, unknown>;

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
        viewTokenHash: expect.any(String),
      }),
      expect.any(Array),
    );
    expect(result.viewToken).toEqual(expect.any(String));
    expect(result.viewTokenHash).toBeUndefined();
    expect(emails.sendOrderCreated).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: expect.any(String) }),
      expect.any(String),
    );
  });

  it('GIVEN valid tracking token WHEN reading public order SHOULD hash token and return order without hash', async () => {
    repo.findByOrderIdAndViewTokenHash.mockResolvedValue({
      id: 'order-1',
      orderId: 'ORD-1',
      viewTokenHash: 'internal-hash',
      orderStatus: OrderStatus.pending,
      total: 10,
      shippingCost: 0,
      customerData: { email: 'buyer@example.com', phone: '+507 6000-0000' },
      shippingData: { address: { address: 'Street 1', city: 'Panama' } },
      items: [],
      statusHistory: [],
      paymentMethod: 'pending',
      tenantId: 'tenant-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = (await service.findPublicTracking(
      'ORD-1',
      'tenant-1',
      'public-token',
    )) as Record<string, unknown>;

    expect(repo.findByOrderIdAndViewTokenHash).toHaveBeenCalledWith(
      'ORD-1',
      'tenant-1',
      hashToken('public-token'),
    );
    expect(result.orderId).toBe('ORD-1');
    expect(result.viewTokenHash).toBeUndefined();
    expect(result.customerData).toEqual({
      email: 'b***@example.com',
      phone: '+507 ***-****',
    });
  });

  it('GIVEN view token only WHEN reading public order SHOULD use token hash lookup', async () => {
    repo.findByViewTokenHash.mockResolvedValue({
      id: 'order-1',
      orderId: 'ORD-1',
      viewTokenHash: 'internal-hash',
      orderStatus: OrderStatus.pending,
      total: 10,
      shippingCost: 0,
      customerData: { email: 'buyer@example.com' },
      shippingData: {},
      items: [],
      statusHistory: [],
      paymentMethod: 'pending',
      tenantId: 'tenant-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = (await service.findPublicTracking(
      'public-token',
      'tenant-1',
    )) as Record<string, unknown>;

    expect(repo.findByViewTokenHash).toHaveBeenCalledWith(
      'tenant-1',
      hashToken('public-token'),
    );
    expect(result.orderId).toBe('ORD-1');
    expect(result.viewTokenHash).toBeUndefined();
  });

  it('GIVEN missing tracking token WHEN reading public order SHOULD reject before querying', async () => {
    await expect(
      service.findPublicTracking('', 'tenant-1'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'ORDER_TRACKING_TOKEN_REQUIRED',
      }),
    });

    expect(repo.findByOrderIdAndViewTokenHash).not.toHaveBeenCalled();
  });

  it('GIVEN invalid tracking token WHEN reading public order SHOULD hide the order', async () => {
    repo.findByOrderIdAndViewTokenHash.mockResolvedValue(null);

    await expect(
      service.findPublicTracking('ORD-1', 'tenant-1', 'bad-token'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'ORDER_NOT_FOUND' }),
    });
  });

  it('GIVEN email and order id WHEN public tracking by email SHOULD return masked tracking data', async () => {
    repo.findByOrderIdAndCustomerEmail.mockResolvedValue({
      id: 'order-1',
      orderId: 'ORD-1',
      viewTokenHash: 'internal-hash',
      orderStatus: OrderStatus.pending,
      total: 10,
      shippingCost: 0,
      customerData: { email: 'buyer@example.com', name: 'Buyer' },
      shippingData: { address: { address: 'Street 1', city: 'Panama' } },
      items: [],
      statusHistory: [{ status: OrderStatus.pending, createdAt: new Date() }],
      paymentMethod: 'pending',
      tenantId: 'tenant-1',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = (await service.findPublicTrackingByEmail('tenant-1', {
      orderId: 'ORD-1',
      email: 'Buyer@Example.com',
    })) as Record<string, unknown>;

    expect(repo.findByOrderIdAndCustomerEmail).toHaveBeenCalledWith(
      'ORD-1',
      'tenant-1',
      'buyer@example.com',
    );
    expect(result.viewTokenHash).toBeUndefined();
    expect(result.customerData).toEqual({
      name: 'B***',
      email: 'b***@example.com',
    });
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

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
