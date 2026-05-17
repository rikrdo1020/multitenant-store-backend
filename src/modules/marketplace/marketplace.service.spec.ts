import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MarketplaceService } from './marketplace.service';
import type { PrismaService } from '../../prisma/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

const makeTenant = (overrides = {}) => ({
  id: 'tenant_1',
  slug: 'mi-tienda',
  name: 'Mi Tienda',
  description: 'Descripción de prueba',
  logo: null,
  primaryColor: '#ff0000',
  products: [],
  ...overrides,
});

const makeProduct = (overrides = {}) => ({
  id: 'prod_1',
  name: 'Producto A',
  slug: 'producto-a',
  price: new Decimal('29.99'),
  images: ['https://example.com/img.jpg'],
  ...overrides,
});

const makePrisma = () => ({
  tenant: {
    findMany: vi.fn(),
    count: vi.fn(),
  },
});

describe('MarketplaceService', () => {
  let service: MarketplaceService;
  let prisma: ReturnType<typeof makePrisma>;

  beforeEach(() => {
    prisma = makePrisma();
    service = new MarketplaceService(prisma as unknown as PrismaService);
  });

  describe('listStores', () => {
    it('GIVEN active tenants SHOULD return serialized stores with pagination meta', async () => {
      const tenant = makeTenant();
      prisma.tenant.findMany.mockResolvedValue([tenant]);
      prisma.tenant.count.mockResolvedValue(1);

      const result = await service.listStores(1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.data[0]).toMatchObject({ documentId: 'tenant_1', slug: 'mi-tienda', name: 'Mi Tienda' });
      expect(result.meta).toMatchObject({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    });

    it('GIVEN page 2 SHOULD calculate correct skip offset', async () => {
      prisma.tenant.findMany.mockResolvedValue([]);
      prisma.tenant.count.mockResolvedValue(25);

      await service.listStores(2, 10);

      expect(prisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 10, take: 10 }),
      );
    });

    it('GIVEN no active tenants SHOULD return empty data with zero total', async () => {
      prisma.tenant.findMany.mockResolvedValue([]);
      prisma.tenant.count.mockResolvedValue(0);

      const result = await service.listStores();

      expect(result.data).toHaveLength(0);
      expect(result.meta.total).toBe(0);
      expect(result.meta.totalPages).toBe(0);
    });

    it('GIVEN tenant with featured products SHOULD serialize Decimal prices to numbers', async () => {
      const tenant = makeTenant({ products: [makeProduct()] });
      prisma.tenant.findMany.mockResolvedValue([tenant]);
      prisma.tenant.count.mockResolvedValue(1);

      const result = await service.listStores();
      const store = result.data[0] as { products: { price: unknown }[] };

      expect(typeof store.products[0].price).toBe('number');
      expect(store.products[0].price).toBe(29.99);
    });

    it('SHOULD query only active tenants', async () => {
      prisma.tenant.findMany.mockResolvedValue([]);
      prisma.tenant.count.mockResolvedValue(0);

      await service.listStores();

      expect(prisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: 'active' } }),
      );
      expect(prisma.tenant.count).toHaveBeenCalledWith({ where: { status: 'active' } });
    });

    it('SHOULD select only public fields — no providerConfig or ownerId', async () => {
      prisma.tenant.findMany.mockResolvedValue([]);
      prisma.tenant.count.mockResolvedValue(0);

      await service.listStores();

      const callArg = prisma.tenant.findMany.mock.calls[0][0] as { select: Record<string, unknown> };
      expect(callArg.select).not.toHaveProperty('ownerId');
      expect(callArg.select).not.toHaveProperty('providerConfig');
      expect(callArg.select).toHaveProperty('slug');
      expect(callArg.select).toHaveProperty('name');
    });

    it('GIVEN multiple tenants SHOULD return all of them', async () => {
      prisma.tenant.findMany.mockResolvedValue([
        makeTenant({ id: 't1', slug: 'store-a', name: 'Store A' }),
        makeTenant({ id: 't2', slug: 'store-b', name: 'Store B' }),
      ]);
      prisma.tenant.count.mockResolvedValue(2);

      const result = await service.listStores();

      expect(result.data).toHaveLength(2);
    });
  });
});
