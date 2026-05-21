import { NotFoundException } from '@nestjs/common';
import { ShippingType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ShippingService } from './shipping.service';

describe('ShippingService', () => {
  const repo = {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };

  const service = new ShippingService(repo as any);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GIVEN storefront shipping request WHEN listing methods SHOULD return active tenant methods only', async () => {
    repo.findAll.mockResolvedValue([]);

    await service.findAll('tenant-1');

    expect(repo.findAll).toHaveBeenCalledWith('tenant-1');
  });

  it('GIVEN admin shipping request WHEN listing methods SHOULD include inactive tenant methods', async () => {
    repo.findAll.mockResolvedValue([]);

    await service.findAllForAdmin('tenant-1');

    expect(repo.findAll).toHaveBeenCalledWith('tenant-1', true);
  });

  it('GIVEN a tenant shipping method and location WHEN calculating SHOULD return base plus extra price', async () => {
    repo.findById.mockResolvedValue({
      id: 'ship-1',
      name: 'Envio local',
      type: ShippingType.delivery_zone,
      basePrice: 4.5,
      tenantId: 'tenant-1',
      logistics: [{ id: 'loc-1', key: 'city', label: 'Ciudad', extraPrice: 1.25 }],
    });

    const result = await service.calculate('tenant-1', { methodId: 'ship-1', locationId: 'loc-1' });

    expect(repo.findById).toHaveBeenCalledWith('ship-1', 'tenant-1');
    expect(result).toEqual({ methodId: 'ship-1', locationId: 'loc-1', cost: 5.75 });
  });

  it('GIVEN a location key WHEN calculating SHOULD accept it as the selected zone', async () => {
    repo.findById.mockResolvedValue({
      id: 'ship-1',
      name: 'Envio local',
      type: ShippingType.delivery_zone,
      basePrice: 2,
      tenantId: 'tenant-1',
      logistics: [{ id: 'loc-1', key: 'city', label: 'Ciudad', extraPrice: 3 }],
    });

    const result = await service.calculate('tenant-1', { methodId: 'ship-1', locationId: 'city' });

    expect(result).toEqual({ methodId: 'ship-1', locationId: 'loc-1', cost: 5 });
  });

  it('GIVEN an unknown shipping method WHEN calculating SHOULD reject with not found', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(service.calculate('tenant-1', { methodId: 'missing' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('GIVEN a location outside the method WHEN calculating SHOULD reject with not found', async () => {
    repo.findById.mockResolvedValue({
      id: 'ship-1',
      name: 'Envio local',
      type: ShippingType.delivery_zone,
      basePrice: 2,
      tenantId: 'tenant-1',
      logistics: [{ id: 'loc-1', key: 'city', label: 'Ciudad', extraPrice: 3 }],
    });

    await expect(service.calculate('tenant-1', { methodId: 'ship-1', locationId: 'loc-2' }))
      .rejects.toBeInstanceOf(NotFoundException);
  });

  it('GIVEN inactive method update WHEN saving SHOULD allow admin changes', async () => {
    repo.findById.mockResolvedValue({
      id: 'ship-1',
      name: 'Envio pausado',
      type: ShippingType.delivery_zone,
      basePrice: 2,
      isActive: false,
      tenantId: 'tenant-1',
      logistics: [],
    });
    repo.update.mockResolvedValue({
      id: 'ship-1',
      name: 'Envio pausado',
      type: ShippingType.delivery_zone,
      basePrice: 2,
      isActive: true,
      tenantId: 'tenant-1',
      logistics: [],
    });

    await service.update('ship-1', 'tenant-1', { isActive: true });

    expect(repo.findById).toHaveBeenCalledWith('ship-1', 'tenant-1', true);
    expect(repo.update).toHaveBeenCalledWith('ship-1', { isActive: true });
  });
});
