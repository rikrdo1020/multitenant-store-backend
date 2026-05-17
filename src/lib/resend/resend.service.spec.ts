import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Resend } from 'resend';
import { ResendService } from './resend.service';

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({}),
    },
  })),
}));

describe('ResendService configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

    new ResendService(config as any);

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

    expect(() => new ResendService(config as any)).toThrow('Missing config: RESEND_FROM_EMAIL');
  });
});
