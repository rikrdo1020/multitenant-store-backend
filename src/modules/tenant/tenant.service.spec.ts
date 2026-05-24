import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TenantService } from './tenant.service';
import type { TenantRepository } from './tenant.repository';

const makeTenant = (overrides = {}) => ({
  id: 'tenant_1',
  slug: 'my-store',
  name: 'My Store',
  description: null,
  logo: null,
  primaryColor: '#000000',
  status: 'active',
  plan: 'FREE',
  planActivatedAt: null,
  ownerId: 'user_1',
  seoTitle: null,
  seoDescription: null,
  provider: 'stripe',
  providerConfig: null,
  customDomain: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

const makeRepo = () => ({
  findBySlug: vi.fn(),
  findById: vi.fn(),
  findAll: vi.fn(),
  findByOwner: vi.fn(),
  isSlugTaken: vi.fn(),
  count: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  updateStatus: vi.fn(),
});

describe('TenantService', () => {
  let service: TenantService;
  let repo: ReturnType<typeof makeRepo>;

  beforeEach(() => {
    repo = makeRepo();
    service = new TenantService(repo as unknown as TenantRepository);
  });

  describe('create', () => {
    it('GIVEN valid input SHOULD create tenant with plan = FREE by default', async () => {
      const created = makeTenant();
      repo.findBySlug.mockResolvedValue(null);
      repo.create.mockResolvedValue(created);

      const result = await service.create({
        slug: 'my-store',
        name: 'My Store',
        ownerId: 'user_1',
      });

      expect(result).toMatchObject({ plan: 'FREE', planActivatedAt: null });
    });

    it('GIVEN valid input SHOULD expose plan in serialized response', async () => {
      const created = makeTenant({ plan: 'FREE' });
      repo.findBySlug.mockResolvedValue(null);
      repo.create.mockResolvedValue(created);

      const result = await service.create({ slug: 'my-store', name: 'My Store', ownerId: 'user_1' });

      expect(result).toHaveProperty('plan', 'FREE');
      expect(result).not.toHaveProperty('id');
    });

    it('GIVEN duplicate slug SHOULD throw ConflictException', async () => {
      repo.findBySlug.mockResolvedValue(makeTenant());

      await expect(
        service.create({ slug: 'my-store', name: 'My Store', ownerId: 'user_1' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findByIdOrFail', () => {
    it('GIVEN existing tenant SHOULD return serialized tenant with plan field', async () => {
      repo.findById.mockResolvedValue(makeTenant({ plan: 'FREE' }));

      const result = await service.findByIdOrFail('tenant_1');

      expect(result).toHaveProperty('plan', 'FREE');
      expect(result).toHaveProperty('documentId', 'tenant_1');
    });

    it('GIVEN non-existent tenant SHOULD throw NotFoundException', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findByIdOrFail('bad_id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('checkSlug', () => {
    it('GIVEN available slug SHOULD return available true', async () => {
      repo.isSlugTaken.mockResolvedValue(false);

      const result = await service.checkSlug('free-slug');

      expect(result).toEqual({ available: true });
    });

    it('GIVEN taken slug SHOULD return available false', async () => {
      repo.isSlugTaken.mockResolvedValue(true);

      const result = await service.checkSlug('taken-slug');

      expect(result).toEqual({ available: false });
    });

    it('GIVEN excludeId SHOULD pass it to repo', async () => {
      repo.isSlugTaken.mockResolvedValue(false);

      await service.checkSlug('my-store', 'tenant_1');

      expect(repo.isSlugTaken).toHaveBeenCalledWith('my-store', 'tenant_1');
    });
  });

  describe('findByOwner', () => {
    it('GIVEN owner with tenants SHOULD return serialized list', async () => {
      repo.findByOwner.mockResolvedValue([makeTenant()]);

      const result = await service.findByOwner('user_1');

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ documentId: 'tenant_1', slug: 'my-store' });
      expect(result[0]).not.toHaveProperty('id');
    });

    it('GIVEN owner with no tenants SHOULD return empty array', async () => {
      repo.findByOwner.mockResolvedValue([]);

      const result = await service.findByOwner('user_1');

      expect(result).toHaveLength(0);
    });
  });

  describe('updateProfile', () => {
    it('GIVEN valid owner and data SHOULD update and serialize tenant', async () => {
      const updated = makeTenant({ name: 'New Name' });
      repo.findById.mockResolvedValue(makeTenant());
      repo.update.mockResolvedValue(updated);

      const result = await service.updateProfile('tenant_1', 'user_1', { name: 'New Name' });

      expect(repo.update).toHaveBeenCalledWith('tenant_1', { name: 'New Name' });
      expect(result).toMatchObject({ documentId: 'tenant_1', name: 'New Name' });
    });

    it('GIVEN non-existent tenant SHOULD throw NotFoundException', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.updateProfile('bad_id', 'user_1', {})).rejects.toThrow(NotFoundException);
    });

    it('GIVEN wrong owner SHOULD throw ForbiddenException', async () => {
      repo.findById.mockResolvedValue(makeTenant({ ownerId: 'other_user' }));

      await expect(service.updateProfile('tenant_1', 'user_1', {})).rejects.toThrow(ForbiddenException);
    });

    it('GIVEN new slug that is taken SHOULD throw ConflictException', async () => {
      repo.findById.mockResolvedValue(makeTenant());
      repo.findBySlug.mockResolvedValue(makeTenant({ id: 'other_tenant', slug: 'taken-slug' }));

      await expect(
        service.updateProfile('tenant_1', 'user_1', { slug: 'taken-slug' }),
      ).rejects.toThrow(ConflictException);
    });

    it('GIVEN same slug as current SHOULD NOT check uniqueness', async () => {
      const tenant = makeTenant({ slug: 'my-store' });
      repo.findById.mockResolvedValue(tenant);
      repo.update.mockResolvedValue(tenant);

      await service.updateProfile('tenant_1', 'user_1', { slug: 'my-store' });

      expect(repo.findBySlug).not.toHaveBeenCalled();
    });

    it('GIVEN new unique slug SHOULD update successfully', async () => {
      repo.findById.mockResolvedValue(makeTenant());
      repo.findBySlug.mockResolvedValue(null);
      repo.update.mockResolvedValue(makeTenant({ slug: 'new-slug' }));

      const result = await service.updateProfile('tenant_1', 'user_1', { slug: 'new-slug' });

      expect(result).toMatchObject({ slug: 'new-slug' });
    });
  });
});
