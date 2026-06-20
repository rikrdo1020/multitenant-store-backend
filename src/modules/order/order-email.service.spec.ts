import { EmailAction, OrderStatus, UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderEmailService } from './order-email.service';

describe('OrderEmailService', () => {
  const repo = {
    findTenantEmailContext: vi.fn(),
  };
  const resend = {
    sendEmail: vi.fn(),
  };
  const config = {
    get: vi.fn().mockReturnValue('multitenant://track'),
  };
  const service = new OrderEmailService(
    repo as any,
    resend as any,
    config as any,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    repo.findTenantEmailContext.mockResolvedValue({
      id: 'tenant-1',
      slug: 'demo-store',
      name: 'Demo Store',
      owner: { email: 'owner@example.com', name: 'Owner' },
      settings: {
        emailFrom: 'orders@example.com',
        emailFromName: 'Demo Orders',
        currency: 'USD',
      },
      members: [
        {
          role: UserRole.admin,
          user: { email: 'admin@example.com', name: 'Admin' },
        },
        {
          role: UserRole.manager,
          user: { email: 'manager@example.com', name: 'Manager' },
        },
      ],
    });
    resend.sendEmail.mockResolvedValue(undefined);
  });

  it('GIVEN a new order WHEN sending created emails SHOULD notify customer and admins', async () => {
    const order = makeOrder({ orderStatus: OrderStatus.pending });

    await service.sendOrderCreated(order, 'view-token');

    expect(resend.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'buyer@example.com',
        subject: 'Orden recibida ORD-1',
        from: 'orders@example.com',
        fromName: 'Demo Orders',
        html: expect.stringContaining('token=view-token'),
      }),
      expect.objectContaining({
        action: EmailAction.order_created_customer,
        tenantId: 'tenant-1',
      }),
    );
    expect(resend.sendEmail).toHaveBeenCalledTimes(3);
    expect(resend.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('tenantSlug=demo-store'),
      }),
      expect.any(Object),
    );
    expect(resend.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'owner@example.com', subject: 'Nueva orden ORD-1' }),
      expect.objectContaining({ action: EmailAction.order_created_admin }),
    );
    expect(resend.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'admin@example.com', subject: 'Nueva orden ORD-1' }),
      expect.objectContaining({ action: EmailAction.order_created_admin }),
    );
  });

  it('GIVEN a paid order WHEN sending status email SHOULD use payment confirmed template', async () => {
    await service.sendOrderStatusNotification(makeOrder({ orderStatus: OrderStatus.paid }));

    expect(resend.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'buyer@example.com',
        subject: 'Pago confirmado ORD-1',
        html: expect.stringContaining('pagado'),
      }),
      expect.objectContaining({ action: EmailAction.payment_confirmed }),
    );
    expect(resend.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('tenantSlug=demo-store'),
      }),
      expect.any(Object),
    );
  });

  it('GIVEN a non-paid order WHEN sending status email SHOULD use status-change template', async () => {
    await service.sendOrderStatusNotification(makeOrder({ orderStatus: OrderStatus.cancelled }));

    expect(resend.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'buyer@example.com',
        subject: 'Actualizacion de orden ORD-1',
        html: expect.stringContaining('cancelado'),
      }),
      expect.objectContaining({ action: EmailAction.order_status_changed }),
    );
  });
});

function makeOrder(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'order-db-1',
    orderId: 'ORD-1',
    tenantId: 'tenant-1',
    total: 25,
    pricingBreakdown: {
      subtotal: 20,
      discount: 0,
      shippingCost: 5,
      tax: 0,
      total: 25,
    },
    shippingCost: 5,
    orderStatus: OrderStatus.pending,
    customerData: { email: 'Buyer@Example.com', name: 'Buyer' },
    shippingData: {},
    items: [{ name: 'Product', quantity: 2, unitPrice: 10 }],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as any;
}
