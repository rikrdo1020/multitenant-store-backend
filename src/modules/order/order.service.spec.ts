import { ForbiddenException } from '@nestjs/common';
import { OrderStatus, UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    findTenantMemberUserIds: vi.fn().mockResolvedValue([]),
  };

  const notifications = { send: vi.fn().mockResolvedValue(undefined) };
  const service = new OrderService(repo as any, notifications as any);

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
  });

  it('GIVEN a tenant member WHEN listing orders SHOULD keep admin tenant-scoped access', async () => {
    repo.hasTenantMembership.mockResolvedValue({ id: 'member-1' });

    await service.findAllForUser('tenant-1', adminUser, { status: OrderStatus.pending });

    expect(repo.findMany).toHaveBeenCalledWith(
      { tenantId: 'tenant-1', status: OrderStatus.pending, customerId: undefined, search: undefined },
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

    expect(repo.findByIdForCustomerEmail).toHaveBeenCalledWith('order-1', 'tenant-1', 'buyer@example.com');
    expect(repo.findById).not.toHaveBeenCalled();
  });

  it('GIVEN checkout customer data WHEN creating an order SHOULD upsert and connect the tenant customer', async () => {
    repo.upsertCustomerFromOrder.mockResolvedValue({ id: 'customer-1' });
    repo.create.mockImplementation(async (data) => ({
      id: 'order-1',
      ...data,
      orderStatus: OrderStatus.pending,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    await service.create('tenant-1', {
      customerData: {
        name: 'Buyer',
        email: 'Buyer@Example.com',
        phone: '+50760000000',
      },
      shippingData: {
        address: { address: 'Street 1', city: 'Panama' },
      },
      items: [{ productId: 'prod-1', name: 'Product', quantity: 2, unitPrice: 5 }],
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
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        total: 13,
        customerData: { name: 'Buyer', email: 'buyer@example.com', phone: '+50760000000' },
        customer: { connect: { id: 'customer-1' } },
      }),
    );
  });

  it('GIVEN a non-member authenticated user WHEN updating status SHOULD reject the mutation', async () => {
    await expect(
      service.updateStatusForUser('order-1', 'tenant-1', customerUser, { orderStatus: OrderStatus.paid }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(repo.update).not.toHaveBeenCalled();
  });
});
