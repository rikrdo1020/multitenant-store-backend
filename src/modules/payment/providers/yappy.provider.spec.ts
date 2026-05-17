import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { YappyProvider } from './yappy.provider';

const mockValidateMerchant = vi.fn();
const mockCreatePayment = vi.fn();

vi.mock('@rikrdo1020/yappy-button/server', () => ({
  validateYappyMerchant: (...args: unknown[]) => mockValidateMerchant(...args),
  createYappyPayment: (...args: unknown[]) => mockCreatePayment(...args),
}));

function makeConfigService(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    YAPPY_MOCK: 'false',
    YAPPY_MERCHANT_ID: 'merchant-123',
    YAPPY_URL_DOMAIN: 'store.test',
    YAPPY_SECRET_KEY: 'c2VjcmV0',
    YAPPY_API_URL: 'https://api.yappy.test',
    YAPPY_SITE_URL: 'https://backend.test',
    ...overrides,
  };

  return {
    get: (key: string, defaultVal?: string) => values[key] ?? defaultVal,
    getOrThrow: (key: string) => {
      if (!(key in values)) throw new Error(`Missing config: ${key}`);
      return values[key];
    },
  } as unknown as ConfigService;
}

const baseParams = { orderId: 'ORD-001', amount: 50, tenantId: 'tenant-1' };

describe('YappyProvider', () => {
  let provider: YappyProvider;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('mock mode', () => {
    beforeEach(() => {
      provider = new YappyProvider(makeConfigService({ YAPPY_MOCK: 'true' }));
    });

    it('returns mock transactionId without calling Yappy API', async () => {
      const result = await provider.createPayment(baseParams);

      expect(result.transactionId).toMatch(/^MOCK-TXN-/);
      expect(result.documentName).toMatch(/^MOCK-DOC-ORD-001/);
      expect(mockValidateMerchant).not.toHaveBeenCalled();
      expect(mockCreatePayment).not.toHaveBeenCalled();
    });

    it('isMock returns true', () => {
      expect(provider.isMock()).toBe(true);
    });
  });

  describe('production mode', () => {
    beforeEach(() => {
      provider = new YappyProvider(makeConfigService());
    });

    it('isMock returns false', () => {
      expect(provider.isMock()).toBe(false);
    });

    it('throws when merchant validation fails', async () => {
      mockValidateMerchant.mockResolvedValue({ success: false, message: 'invalid merchant' });

      await expect(provider.createPayment(baseParams)).rejects.toThrow(BadRequestException);
    });

    it('throws when merchant token is missing', async () => {
      mockValidateMerchant.mockResolvedValue({ success: true });

      await expect(provider.createPayment(baseParams)).rejects.toThrow(BadRequestException);
    });

    it('throws when createYappyPayment fails', async () => {
      mockValidateMerchant.mockResolvedValue({ success: true, token: 'tok-xyz' });
      mockCreatePayment.mockResolvedValue({ success: false, message: 'payment failed' });

      await expect(provider.createPayment(baseParams)).rejects.toThrow(BadRequestException);
    });

    it('returns transactionId and documentName on success', async () => {
      mockValidateMerchant.mockResolvedValue({ success: true, token: 'tok-xyz' });
      mockCreatePayment.mockResolvedValue({
        success: true,
        transactionId: 'TXN-ABC',
        documentName: 'DOC-XYZ',
        token: 'payment-tok',
      });

      const result = await provider.createPayment({ ...baseParams, aliasYappy: '6789-1234' });

      expect(result.transactionId).toBe('TXN-ABC');
      expect(result.documentName).toBe('DOC-XYZ');
      expect(mockCreatePayment).toHaveBeenCalledWith(
        expect.objectContaining({ merchantId: 'merchant-123' }),
        expect.objectContaining({ orderId: 'ORD-001', aliasYappy: '6789-1234', total: 50 }),
      );
    });

    it('passes empty string as aliasYappy when not provided', async () => {
      mockValidateMerchant.mockResolvedValue({ success: true, token: 'tok-xyz' });
      mockCreatePayment.mockResolvedValue({ success: true, transactionId: 'TXN-1' });

      await provider.createPayment(baseParams);

      expect(mockCreatePayment).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ aliasYappy: '' }),
      );
    });
  });
});
