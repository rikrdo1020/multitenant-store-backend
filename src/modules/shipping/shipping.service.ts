import { Injectable, NotFoundException } from '@nestjs/common';
import { ShippingRepository } from './shipping.repository';
import { CreateShippingMethodDto } from './dto/create-shipping-method.dto';
import { CalculateShippingDto } from './dto/calculate-shipping.dto';
import { serialize } from '../../common/utils/serializer';

@Injectable()
export class ShippingService {
  constructor(private readonly repo: ShippingRepository) {}

  async findAll(tenantId: string) {
    return (await this.repo.findAll(tenantId)).map(serialize);
  }

  async findAllForAdmin(tenantId: string) {
    return (await this.repo.findAll(tenantId, true)).map(serialize);
  }

  async findById(id: string, tenantId: string, includeInactive = false) {
    const method = await this.repo.findById(id, tenantId, includeInactive);
    if (!method) throw new NotFoundException({ code: 'SHIPPING_METHOD_NOT_FOUND', message: 'Shipping method not found' });
    return serialize(method);
  }

  async calculate(tenantId: string, query: CalculateShippingDto) {
    const method = await this.repo.findById(query.methodId, tenantId);
    if (!method) {
      throw new NotFoundException({ code: 'SHIPPING_METHOD_NOT_FOUND', message: 'Shipping method not found' });
    }

    const location = query.locationId
      ? method.logistics.find((item) => item.id === query.locationId || item.key === query.locationId)
      : null;

    if (query.locationId && !location) {
      throw new NotFoundException({ code: 'SHIPPING_LOCATION_NOT_FOUND', message: 'Shipping location not found' });
    }

    return {
      methodId: method.id,
      locationId: location?.id ?? null,
      cost: this.roundMoney(this.toMoney(method.basePrice) + this.toMoney(location?.extraPrice)),
    };
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
    await this.findById(id, tenantId, true);
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
    await this.findById(id, tenantId, true);
    await this.repo.delete(id);
  }

  private toMoney(value: unknown): number {
    if (value == null) return 0;
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
