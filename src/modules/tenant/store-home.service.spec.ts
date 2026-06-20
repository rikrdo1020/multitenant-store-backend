import { describe, expect, it, vi } from 'vitest';
import { StoreHomeService } from './store-home.service';

describe('StoreHomeService', () => {
  const repo = {
    findTenantProfile: vi.fn(),
    findFeaturedProducts: vi.fn(),
    findCategories: vi.fn(),
    findLatestProducts: vi.fn(),
    findActiveBanners: vi.fn(),
  };

  const service = new StoreHomeService(repo as any);

  it('GIVEN curated store data WHEN loading home SHOULD return featured, categories, latest, and banners', async () => {
    repo.findTenantProfile.mockResolvedValue({
      id: 'tenant-1',
      slug: 'demo',
      name: 'Demo Store',
      logo: 'https://img.test/logo.png',
      description: 'Demo description',
      primaryColor: '#111111',
      settings: { currency: 'USD' },
    });
    repo.findFeaturedProducts.mockResolvedValue([
      {
        id: 'prod-1',
        name: 'Featured',
        slug: 'featured',
        stock: 5,
        reservedStock: 2,
        price: 10,
        images: ['https://img.test/p.png'],
      },
    ]);
    repo.findCategories.mockResolvedValue([
      {
        id: 'cat-1',
        name: 'Audio',
        slug: 'audio',
        images: ['https://img.test/cat.png'],
      },
    ]);
    repo.findLatestProducts.mockResolvedValue([
      {
        id: 'prod-2',
        name: 'Latest',
        slug: 'latest',
        stock: 0,
        reservedStock: 0,
        price: 20,
        images: [],
      },
    ]);
    repo.findActiveBanners.mockResolvedValue([
      {
        id: 'banner-1',
        title: 'Oferta',
        order: 0,
        active: true,
      },
    ]);

    const result = (await service.getHome('tenant-1')) as Record<string, any>;

    expect(repo.findFeaturedProducts).toHaveBeenCalledWith('tenant-1');
    expect(result.tenant.documentId).toBe('tenant-1');
    expect(result.featuredProducts[0].documentId).toBe('prod-1');
    expect(result.featuredProducts[0].availableStock).toBe(3);
    expect(result.categories[0].image).toBe('https://img.test/cat.png');
    expect(result.latestProducts[0].stockStatus).toBe('out_of_stock');
    expect(result.banners[0].documentId).toBe('banner-1');
  });

  it('GIVEN empty curated data WHEN loading home SHOULD return empty sections for fallback UI', async () => {
    repo.findTenantProfile.mockResolvedValue({
      id: 'tenant-1',
      slug: 'demo',
      name: 'Demo Store',
      logo: null,
      description: null,
      primaryColor: '#111111',
      settings: null,
    });
    repo.findFeaturedProducts.mockResolvedValue([]);
    repo.findCategories.mockResolvedValue([]);
    repo.findLatestProducts.mockResolvedValue([]);
    repo.findActiveBanners.mockResolvedValue([]);

    const result = (await service.getHome('tenant-1')) as Record<string, any>;

    expect(result.featuredProducts).toEqual([]);
    expect(result.categories).toEqual([]);
    expect(result.latestProducts).toEqual([]);
    expect(result.banners).toEqual([]);
  });
});
