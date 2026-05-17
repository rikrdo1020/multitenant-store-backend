import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketplaceController } from './marketplace.controller';
import type { MarketplaceService } from './marketplace.service';

const makeService = () => ({
  listStores: vi.fn(),
});

const makeResult = (overrides = {}) => ({
  data: [],
  meta: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  ...overrides,
});

describe('MarketplaceController', () => {
  let controller: MarketplaceController;
  let service: ReturnType<typeof makeService>;

  beforeEach(() => {
    service = makeService();
    controller = new MarketplaceController(service as unknown as MarketplaceService);
  });

  describe('listStores', () => {
    it('GIVEN no query params SHOULD call service with default page and pageSize', async () => {
      service.listStores.mockResolvedValue(makeResult());

      await controller.listStores({});

      expect(service.listStores).toHaveBeenCalledWith(undefined, undefined);
    });

    it('GIVEN page and pageSize SHOULD forward them to service', async () => {
      service.listStores.mockResolvedValue(makeResult());

      await controller.listStores({ page: 2, pageSize: 10 });

      expect(service.listStores).toHaveBeenCalledWith(2, 10);
    });

    it('SHOULD return whatever the service returns', async () => {
      const mockResult = makeResult({
        data: [{ documentId: 't1', slug: 'my-store', name: 'My Store' }],
        meta: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });
      service.listStores.mockResolvedValue(mockResult);

      const result = await controller.listStores({});

      expect(result).toBe(mockResult);
    });
  });
});
