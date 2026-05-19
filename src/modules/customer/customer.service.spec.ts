import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerService } from './customer.service';

describe('CustomerService current customer profile and addresses', () => {
  const repo = {
    findMany: vi.fn(),
    count: vi.fn(),
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findUserById: vi.fn(),
    hasTenantMembership: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findAddresses: vi.fn(),
    countAddresses: vi.fn(),
    findAddressById: vi.fn(),
    createAddress: vi.fn(),
    updateAddress: vi.fn(),
    deleteAddress: vi.fn(),
  };

  const service = new CustomerService(repo as any);
  const user = {
    sub: 'user-1',
    email: 'Buyer@Example.com',
    role: UserRole.admin,
  };

  const customer = {
    id: 'customer-1',
    name: 'Buyer',
    email: 'buyer@example.com',
    phone: '+50760000000',
    tenantId: 'tenant-1',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repo.findUserById.mockResolvedValue({
      id: 'user-1',
      email: 'Buyer@Example.com',
      name: 'Buyer',
      phone: '+50760000000',
    });
    repo.findByEmail.mockResolvedValue(customer);
    repo.hasTenantMembership.mockResolvedValue(null);
  });

  it('GIVEN current customer exists WHEN reading me SHOULD resolve by normalized user email and tenant', async () => {
    const result = await service.findCurrent('tenant-1', user);

    expect(repo.findByEmail).toHaveBeenCalledWith('buyer@example.com', 'tenant-1');
    expect(result).toMatchObject({
      documentId: 'customer-1',
      email: 'buyer@example.com',
    });
  });

  it('GIVEN current customer is missing WHEN reading me SHOULD create tenant customer from user snapshot', async () => {
    repo.findByEmail.mockResolvedValue(null);
    repo.create.mockResolvedValue(customer);

    await service.findCurrent('tenant-1', user);

    expect(repo.create).toHaveBeenCalledWith({
      name: 'Buyer',
      email: 'buyer@example.com',
      phone: '+50760000000',
      tenant: { connect: { id: 'tenant-1' } },
    });
  });

  it('GIVEN current customer WHEN updating profile SHOULD not update email', async () => {
    repo.update.mockResolvedValue({ ...customer, name: 'Buyer Updated', phone: '+50761111111' });

    await service.updateCurrent('tenant-1', user, {
      name: ' Buyer Updated ',
      phone: ' +50761111111 ',
    });

    expect(repo.update).toHaveBeenCalledWith('customer-1', {
      name: 'Buyer Updated',
      phone: '+50761111111',
    });
  });

  it('GIVEN user is not a tenant member WHEN using admin customer list SHOULD reject access', async () => {
    await expect(service.findAllForUser('tenant-1', user)).rejects.toBeInstanceOf(ForbiddenException);

    expect(repo.findMany).not.toHaveBeenCalled();
  });

  it('GIVEN first address WHEN creating SHOULD make it default', async () => {
    repo.countAddresses.mockResolvedValue(0);
    repo.createAddress.mockResolvedValue({
      id: 'address-1',
      customerId: 'customer-1',
      name: 'Casa',
      address: 'Street 1',
      city: 'Panama',
      department: 'Panama',
      phone: '+50760000000',
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.createCurrentAddress('tenant-1', user, {
      name: ' Casa ',
      address: ' Street 1 ',
      city: ' Panama ',
      department: ' Panama ',
      phone: ' +50760000000 ',
    });

    expect(repo.createAddress).toHaveBeenCalledWith(
      'customer-1',
      {
        name: 'Casa',
        address: 'Street 1',
        city: 'Panama',
        department: 'Panama',
        phone: '+50760000000',
      },
      true,
    );
  });

  it('GIVEN address fields are blank WHEN creating SHOULD reject without persisting', async () => {
    await expect(
      service.createCurrentAddress('tenant-1', user, {
        name: '   ',
        address: 'Street 1',
        city: 'Panama',
        department: 'Panama',
        phone: '+50760000000',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repo.countAddresses).not.toHaveBeenCalled();
    expect(repo.createAddress).not.toHaveBeenCalled();
  });

  it('GIVEN requested default address WHEN creating SHOULD request default switch', async () => {
    repo.countAddresses.mockResolvedValue(2);
    repo.createAddress.mockResolvedValue({
      id: 'address-2',
      customerId: 'customer-1',
      name: 'Oficina',
      address: 'Street 2',
      city: 'Panama',
      department: 'Panama',
      phone: '+50760000001',
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await service.createCurrentAddress('tenant-1', user, {
      name: 'Oficina',
      address: 'Street 2',
      city: 'Panama',
      department: 'Panama',
      phone: '+50760000001',
      isDefault: true,
    });

    expect(repo.createAddress).toHaveBeenCalledWith(
      'customer-1',
      expect.objectContaining({ name: 'Oficina' }),
      true,
    );
  });

  it('GIVEN address belongs to another customer WHEN updating SHOULD return not found', async () => {
    repo.findAddressById.mockResolvedValue(null);

    await expect(
      service.updateCurrentAddress('tenant-1', user, 'address-other', { city: 'Colon' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(repo.updateAddress).not.toHaveBeenCalled();
  });

  it('GIVEN blank update field WHEN updating address SHOULD reject without mutating', async () => {
    repo.findAddressById.mockResolvedValue({
      id: 'address-1',
      customerId: 'customer-1',
      name: 'Casa',
      address: 'Street 1',
      city: 'Panama',
      department: 'Panama',
      phone: '+50760000000',
      isDefault: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.updateCurrentAddress('tenant-1', user, 'address-1', { city: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(repo.updateAddress).not.toHaveBeenCalled();
  });

  it('GIVEN current address WHEN deleting SHOULD delete within current customer scope', async () => {
    repo.findAddressById.mockResolvedValue({
      id: 'address-1',
      customerId: 'customer-1',
      name: 'Casa',
      address: 'Street 1',
      city: 'Panama',
      department: 'Panama',
      phone: '+50760000000',
      isDefault: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    repo.deleteAddress.mockResolvedValue(undefined);

    await service.removeCurrentAddress('tenant-1', user, 'address-1');

    expect(repo.deleteAddress).toHaveBeenCalledWith('address-1', 'customer-1');
  });
});
