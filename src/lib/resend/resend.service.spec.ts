import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Resend } from 'resend';
import { ResendService } from './resend.service';
import { EmailAction } from '@prisma/client';

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({}),
    },
  })),
}));

describe('ResendService configuration', () => {
  const emailSecurity = {
    reserveDelivery: vi.fn().mockResolvedValue({ id: 'delivery-1', skipped: false }),
    markSent: vi.fn(),
    markFailed: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    emailSecurity.reserveDelivery.mockResolvedValue({ id: 'delivery-1', skipped: false });
  });

  it('GIVEN valid Resend env values WHEN service starts SHOULD read them from config without fallbacks', () => {
    const values: Record<string, string> = {
      RESEND_API_KEY: 're_test_key',
      RESEND_FROM_EMAIL: 'sender@example.com',
      RESEND_FROM_NAME: 'Store Team',
    };
    const config = {
      get: vi.fn(),
      getOrThrow: vi.fn((key: string) => values[key]),
    };

    new ResendService(config as any, emailSecurity as any);

    expect(config.get).not.toHaveBeenCalled();
    expect(config.getOrThrow).toHaveBeenCalledWith('RESEND_API_KEY');
    expect(config.getOrThrow).toHaveBeenCalledWith('RESEND_FROM_EMAIL');
    expect(config.getOrThrow).toHaveBeenCalledWith('RESEND_FROM_NAME');
    expect(Resend).toHaveBeenCalledWith('re_test_key');
  });

  it('GIVEN missing sender config WHEN service starts SHOULD fail instead of inventing a default sender', () => {
    const config = {
      getOrThrow: vi.fn((key: string) => {
        if (key === 'RESEND_FROM_EMAIL') {
          throw new Error('Missing config: RESEND_FROM_EMAIL');
        }

        return key === 'RESEND_API_KEY' ? 're_test_key' : 'Store Team';
      }),
    };

    expect(() => new ResendService(config as any, emailSecurity as any)).toThrow('Missing config: RESEND_FROM_EMAIL');
  });

  it('GIVEN an email policy WHEN sending SHOULD reserve and mark delivery as sent', async () => {
    const values: Record<string, string> = {
      RESEND_API_KEY: 're_test_key',
      RESEND_FROM_EMAIL: 'sender@example.com',
      RESEND_FROM_NAME: 'Store Team',
    };
    const config = {
      get: vi.fn(),
      getOrThrow: vi.fn((key: string) => values[key]),
    };
    const service = new ResendService(config as any, emailSecurity as any);

    await service.sendEmail(
      { to: 'buyer@example.com', subject: 'Subject', html: '<p>Hello</p>' },
      { action: EmailAction.order_created_customer, tenantId: 'tenant-1' },
    );

    expect(emailSecurity.reserveDelivery).toHaveBeenCalledWith({
      action: EmailAction.order_created_customer,
      tenantId: 'tenant-1',
      recipient: 'buyer@example.com',
    });
    expect(emailSecurity.markSent).toHaveBeenCalledWith('delivery-1');
  });
});
