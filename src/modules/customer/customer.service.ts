import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { CustomerRepository } from './customer.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { UpdateCurrentCustomerDto } from './dto/update-current-customer.dto';
import { UpdateCustomerAddressDto } from './dto/update-customer-address.dto';
import { serialize, serializeList } from '../../common/utils/serializer';

export interface AuthenticatedCustomerUser {
  sub: string;
  email: string;
  role: UserRole;
  tenantId?: string;
}

@Injectable()
export class CustomerService {
  constructor(private readonly repo: CustomerRepository) {}

  async findAllForUser(
    tenantId: string,
    user: AuthenticatedCustomerUser,
    page = 1,
    pageSize = 20,
    search?: string,
  ) {
    await this.assertCanManageCustomers(tenantId, user);
    return this.findAll(tenantId, page, pageSize, search);
  }

  async findAll(tenantId: string, page = 1, pageSize = 20, search?: string) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.repo.findMany(tenantId, skip, pageSize, search),
      this.repo.count(tenantId, search),
    ]);
    return serializeList(items, { page, pageSize, total });
  }

  async findByIdForUser(id: string, tenantId: string, user: AuthenticatedCustomerUser) {
    await this.assertCanManageCustomers(tenantId, user);
    return this.findById(id, tenantId);
  }

  async findById(id: string, tenantId: string) {
    const customer = await this.repo.findById(id, tenantId);
    if (!customer) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
    return serialize(customer);
  }

  async findCurrent(tenantId: string, user: AuthenticatedCustomerUser) {
    const customer = await this.findOrCreateCurrentCustomer(tenantId, user);
    return serialize(customer);
  }

  async updateCurrent(tenantId: string, user: AuthenticatedCustomerUser, dto: UpdateCurrentCustomerDto) {
    const customer = await this.findOrCreateCurrentCustomer(tenantId, user);
    const updated = await this.repo.update(customer.id, this.toCurrentCustomerUpdateInput(dto));
    return serialize(updated);
  }

  async createForUser(tenantId: string, user: AuthenticatedCustomerUser, dto: CreateCustomerDto) {
    await this.assertCanManageCustomers(tenantId, user);
    return this.create(tenantId, dto);
  }

  async create(tenantId: string, dto: CreateCustomerDto) {
    const data = this.toCustomerCreateInput(dto);
    const existing = await this.repo.findByEmail(data.email, tenantId);
    if (existing) throw new ConflictException({ code: 'CUSTOMER_EMAIL_TAKEN', message: `Customer with email '${data.email}' already exists` });

    return serialize(await this.repo.create({ ...data, tenant: { connect: { id: tenantId } } }));
  }

  async updateForUser(
    id: string,
    tenantId: string,
    user: AuthenticatedCustomerUser,
    dto: Partial<CreateCustomerDto>,
  ) {
    await this.assertCanManageCustomers(tenantId, user);
    return this.update(id, tenantId, dto);
  }

  async update(id: string, tenantId: string, dto: Partial<CreateCustomerDto>) {
    await this.findById(id, tenantId);
    return serialize(await this.repo.update(id, this.toCustomerUpdateInput(dto)));
  }

  async removeForUser(id: string, tenantId: string, user: AuthenticatedCustomerUser): Promise<void> {
    await this.assertCanManageCustomers(tenantId, user);
    await this.remove(id, tenantId);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.findById(id, tenantId);
    await this.repo.delete(id);
  }

  async findCurrentAddresses(tenantId: string, user: AuthenticatedCustomerUser) {
    const customer = await this.findOrCreateCurrentCustomer(tenantId, user);
    return (await this.repo.findAddresses(customer.id)).map(serialize);
  }

  async createCurrentAddress(
    tenantId: string,
    user: AuthenticatedCustomerUser,
    dto: CreateCustomerAddressDto,
  ) {
    const customer = await this.findOrCreateCurrentCustomer(tenantId, user);
    const input = this.toAddressCreateInput(dto);
    const existingCount = await this.repo.countAddresses(customer.id);
    const makeDefault = dto.isDefault === true || existingCount === 0;
    const address = await this.repo.createAddress(
      customer.id,
      input,
      makeDefault,
    );
    return serialize(address);
  }

  async updateCurrentAddress(
    tenantId: string,
    user: AuthenticatedCustomerUser,
    addressId: string,
    dto: UpdateCustomerAddressDto,
  ) {
    const customer = await this.findOrCreateCurrentCustomer(tenantId, user);
    const address = await this.repo.findAddressById(addressId, customer.id);
    if (!address) throw this.customerAddressNotFound();

    const updated = await this.repo.updateAddress(
      addressId,
      customer.id,
      this.toAddressUpdateInput(dto),
      dto.isDefault === true,
    );
    return serialize(updated);
  }

  async removeCurrentAddress(
    tenantId: string,
    user: AuthenticatedCustomerUser,
    addressId: string,
  ): Promise<void> {
    const customer = await this.findOrCreateCurrentCustomer(tenantId, user);
    const address = await this.repo.findAddressById(addressId, customer.id);
    if (!address) throw this.customerAddressNotFound();

    await this.repo.deleteAddress(addressId, customer.id);
  }

  private async findOrCreateCurrentCustomer(tenantId: string, user: AuthenticatedCustomerUser) {
    const userSnapshot = await this.repo.findUserById(user.sub);
    const email = this.normalizeEmail(userSnapshot?.email ?? user.email);
    const existing = await this.repo.findByEmail(email, tenantId);
    if (existing) return existing;

    const name = this.normalizeOptionalString(userSnapshot?.name) ?? email;
    const phone = this.normalizeOptionalString(userSnapshot?.phone) ?? '';

    return this.repo.create({
      name,
      email,
      phone,
      tenant: { connect: { id: tenantId } },
    });
  }

  private async assertCanManageCustomers(tenantId: string, user: AuthenticatedCustomerUser): Promise<void> {
    if (user.role === UserRole.superadmin) return;
    if (![UserRole.admin, UserRole.manager].includes(user.role)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'User cannot manage customers for this tenant' });
    }

    const membership = await this.repo.hasTenantMembership(user.sub, tenantId);
    if (!membership) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'User cannot manage customers for this tenant' });
    }
  }

  private toCustomerCreateInput(dto: CreateCustomerDto) {
    return {
      name: dto.name.trim(),
      email: this.normalizeEmail(dto.email),
      phone: dto.phone.trim(),
      ...(this.normalizeOptionalString(dto.address) ? { address: this.normalizeOptionalString(dto.address) } : {}),
      ...(this.normalizeOptionalString(dto.city) ? { city: this.normalizeOptionalString(dto.city) } : {}),
      ...(this.normalizeOptionalString(dto.country) ? { country: this.normalizeOptionalString(dto.country) } : {}),
      ...(this.normalizeOptionalString(dto.notes) ? { notes: this.normalizeOptionalString(dto.notes) } : {}),
    };
  }

  private toCustomerUpdateInput(dto: Partial<CreateCustomerDto>) {
    return {
      ...(this.normalizeOptionalString(dto.name) ? { name: this.normalizeOptionalString(dto.name) } : {}),
      ...(dto.email ? { email: this.normalizeEmail(dto.email) } : {}),
      ...(this.normalizeOptionalString(dto.phone) ? { phone: this.normalizeOptionalString(dto.phone) } : {}),
      ...(dto.address !== undefined ? { address: this.normalizeNullableString(dto.address) } : {}),
      ...(dto.city !== undefined ? { city: this.normalizeNullableString(dto.city) } : {}),
      ...(dto.country !== undefined ? { country: this.normalizeNullableString(dto.country) } : {}),
      ...(dto.notes !== undefined ? { notes: this.normalizeNullableString(dto.notes) } : {}),
    };
  }

  private toCurrentCustomerUpdateInput(dto: UpdateCurrentCustomerDto) {
    return {
      ...(this.normalizeOptionalString(dto.name) ? { name: this.normalizeOptionalString(dto.name) } : {}),
      ...(this.normalizeOptionalString(dto.phone) ? { phone: this.normalizeOptionalString(dto.phone) } : {}),
      ...(dto.notes !== undefined ? { notes: this.normalizeNullableString(dto.notes) } : {}),
    };
  }

  private toAddressCreateInput(dto: CreateCustomerAddressDto) {
    return {
      name: this.requireTrimmedString(dto.name, 'name'),
      address: this.requireTrimmedString(dto.address, 'address'),
      city: this.requireTrimmedString(dto.city, 'city'),
      department: this.requireTrimmedString(dto.department, 'department'),
      phone: this.requireTrimmedString(dto.phone, 'phone'),
    };
  }

  private toAddressUpdateInput(dto: UpdateCustomerAddressDto) {
    return {
      ...(dto.name !== undefined ? { name: this.requireTrimmedString(dto.name, 'name') } : {}),
      ...(dto.address !== undefined ? { address: this.requireTrimmedString(dto.address, 'address') } : {}),
      ...(dto.city !== undefined ? { city: this.requireTrimmedString(dto.city, 'city') } : {}),
      ...(dto.department !== undefined ? { department: this.requireTrimmedString(dto.department, 'department') } : {}),
      ...(dto.phone !== undefined ? { phone: this.requireTrimmedString(dto.phone, 'phone') } : {}),
    };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizeOptionalString(value?: string | null): string | undefined {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
  }

  private normalizeNullableString(value?: string | null): string | null {
    return this.normalizeOptionalString(value) ?? null;
  }

  private requireTrimmedString(value: string | undefined | null, field: string): string {
    const normalized = value?.trim();
    if (!normalized) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `${field} is required`,
      });
    }

    return normalized;
  }

  private customerAddressNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'CUSTOMER_ADDRESS_NOT_FOUND',
      message: 'Customer address not found',
    });
  }
}
