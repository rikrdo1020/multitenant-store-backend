import { Injectable, NotFoundException } from '@nestjs/common';
import { ShippingRepository } from './shipping.repository';
import { CreateShippingMethodDto } from './dto/create-shipping-method.dto';
import { serialize } from '../../common/utils/serializer';

@Injectable()
export class ShippingService {
  constructor(private readonly repo: ShippingRepository) {}

  async findAll(tenantId: string) {
    return (await this.repo.findAll(tenantId)).map(serialize);
  }

  async findById(id: string, tenantId: string) {
    const method = await this.repo.findById(id, tenantId);
    if (!method) throw new NotFoundException({ code: 'SHIPPING_METHOD_NOT_FOUND', message: 'Shipping method not found' });
    return serialize(method);
  }

  async create(tenantId: string, dto: CreateShippingMethodDto) {
    const { locations, ...rest } = dto;

    const method = await this.repo.create({
      ...rest,
      tenant: { connect: { id: tenantId } },
      ...(locations?.length && {
        logistics: {
          create: locations.map((l) => ({ key: l.key, label: l.label, extraPrice: l.extraPrice ?? 0 })),
        },
      }),
    });

    return serialize(method);
  }

  async update(id: string, tenantId: string, dto: Partial<CreateShippingMethodDto>) {
    await this.findById(id, tenantId);
    const { locations, ...rest } = dto;

    const updated = await this.repo.update(id, {
      ...rest,
      ...(locations !== undefined && {
        logistics: {
          deleteMany: {},
          create: locations.map((l) => ({ key: l.key, label: l.label, extraPrice: l.extraPrice ?? 0 })),
        },
      }),
    });

    return serialize(updated);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.findById(id, tenantId);
    await this.repo.delete(id);
  }
}
