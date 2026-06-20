import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BannerService } from './banner.service';

describe('BannerService', () => {
  const repo = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const service = new BannerService(repo as any);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GIVEN tenant banners WHEN listing SHOULD return serialized banners scoped by tenant', async () => {
    repo.findAll.mockResolvedValue([{ id: 'banner-1', title: 'Sale', tenantId: 'tenant-1' }]);

    const result = await service.findAll('tenant-1');

    expect(repo.findAll).toHaveBeenCalledWith('tenant-1');
    expect(result[0].documentId).toBe('banner-1');
  });

  it('GIVEN banner payload WHEN creating SHOULD attach tenant ownership', async () => {
    repo.create.mockResolvedValue({ id: 'banner-1', title: 'Sale', active: true });

    await service.create('tenant-1', { title: 'Sale', active: true });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Sale',
        active: true,
        tenant: { connect: { id: 'tenant-1' } },
      }),
    );
  });

  it('GIVEN missing tenant banner WHEN updating SHOULD reject with not found', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(service.update('missing', 'tenant-1', { title: 'Sale' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });
});
