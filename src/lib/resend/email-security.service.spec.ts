import { HttpException } from '@nestjs/common';
import { EmailAction, EmailDeliveryStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashIdentifier } from '../../common/utils/privacy';
import { EmailSecurityService } from './email-security.service';

describe('EmailSecurityService', () => {
  const prisma = {
    findByDedupeHash: vi.fn(),
    count: vi.fn(),
    createAttempt: vi.fn(),
    createSkipped: vi.fn(),
    createBlocked: vi.fn(),
    markSent: vi.fn(),
    markFailed: vi.fn(),
  };
  const config = {
    get: vi.fn((key: string) => {
      const values: Record<string, number> = {
        EMAIL_RECIPIENT_WINDOW_LIMIT: 2,
        EMAIL_RECIPIENT_WINDOW_MINUTES: 15,
        EMAIL_ACTOR_WINDOW_LIMIT: 10,
        EMAIL_ACTOR_WINDOW_MINUTES: 15,
        EMAIL_TENANT_DAILY_LIMIT: 20,
        EMAIL_HOURLY_SEND_LIMIT: 100,
        EMAIL_DAILY_SEND_LIMIT: 500,
      };
      return values[key];
    }),
  };
  const service = new EmailSecurityService(prisma as any, config as any);

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.findByDedupeHash.mockResolvedValue(null);
    prisma.count.mockResolvedValue(0);
    prisma.createAttempt.mockResolvedValue({ id: 'delivery-1' });
    prisma.createSkipped.mockResolvedValue({});
    prisma.createBlocked.mockResolvedValue({});
    prisma.markSent.mockResolvedValue({});
    prisma.markFailed.mockResolvedValue({});
  });

  it('GIVEN an allowed email WHEN reserving delivery SHOULD store hashed identifiers', async () => {
    const result = await service.reserveDelivery({
      action: EmailAction.password_reset,
      recipient: 'User@Example.com',
      actorKey: 'user@example.com',
      tenantId: 'tenant-1',
      dedupeKey: 'token-1',
    });

    expect(result).toEqual({ id: 'delivery-1', skipped: false });
    expect(prisma.createAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        action: EmailAction.password_reset,
        recipientHash: hashIdentifier('user@example.com'),
        actorHash: hashIdentifier('user@example.com'),
        tenantId: 'tenant-1',
        dedupeKeyHash: hashIdentifier(`${EmailAction.password_reset}:token-1`),
      }),
    );
  });

  it('GIVEN an existing dedupe key WHEN reserving delivery SHOULD skip duplicate send', async () => {
    prisma.findByDedupeHash.mockResolvedValue({
      id: 'delivery-old',
      status: EmailDeliveryStatus.sent,
    });

    const result = await service.reserveDelivery({
      action: EmailAction.order_created_customer,
      recipient: 'buyer@example.com',
      dedupeKey: 'order-1',
    });

    expect(result).toEqual({ skipped: true, reason: 'EMAIL_DEDUPED' });
    expect(prisma.createSkipped).toHaveBeenCalledWith(
      expect.objectContaining({
        action: EmailAction.order_created_customer,
        reason: 'EMAIL_DEDUPED',
      }),
    );
  });

  it('GIVEN recipient limit is reached WHEN reserving delivery SHOULD block the send', async () => {
    prisma.count.mockResolvedValueOnce(2);

    await expect(
      service.reserveDelivery({
        action: EmailAction.member_invite,
        recipient: 'member@example.com',
      }),
    ).rejects.toBeInstanceOf(HttpException);

    expect(prisma.createBlocked).toHaveBeenCalledWith(
      expect.objectContaining({
        action: EmailAction.member_invite,
        reason: 'EMAIL_RECIPIENT_RATE_LIMITED',
      }),
    );
  });

  it('GIVEN a send succeeds WHEN marking sent SHOULD update delivery status', async () => {
    await service.markSent('delivery-1');

    expect(prisma.markSent).toHaveBeenCalledWith('delivery-1');
  });
});
