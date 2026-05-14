import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CustomerRepository } from './customer.repository';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { serialize, serializeList } from '../../common/utils/serializer';

@Injectable()
export class CustomerService {
  constructor(private readonly repo: CustomerRepository) {}

  async findAll(tenantId: string, page = 1, pageSize = 20, search?: string) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.repo.findMany(tenantId, skip, pageSize, search),
      this.repo.count(tenantId, search),
    ]);
    return serializeList(items, { page, pageSize, total });
  }

  async findById(id: string, tenantId: string) {
    const customer = await this.repo.findById(id, tenantId);
    if (!customer) throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND', message: 'Customer not found' });
    return serialize(customer);
  }

  async create(tenantId: string, dto: CreateCustomerDto) {
    const existing = await this.repo.findByEmail(dto.email, tenantId);
    if (existing) throw new ConflictException({ code: 'CUSTOMER_EMAIL_TAKEN', message: `Customer with email '${dto.email}' already exists` });

    return serialize(await this.repo.create({ ...dto, tenant: { connect: { id: tenantId } } }));
  }

  async update(id: string, tenantId: string, dto: Partial<CreateCustomerDto>) {
    await this.findById(id, tenantId);
    return serialize(await this.repo.update(id, dto));
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.findById(id, tenantId);
    await this.repo.delete(id);
  }
}
