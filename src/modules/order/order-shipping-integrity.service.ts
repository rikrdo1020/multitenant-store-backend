import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { ResolvedShipping } from './order-integrity.types';
import { OrderRepository } from './order.repository';
import {
  OrderShippingLocationForCheckout,
  OrderShippingMethodForCheckout,
} from './order.types';

@Injectable()
export class OrderShippingIntegrityService {
  constructor(private readonly repo: OrderRepository) {}

  async resolveShipping(
    tenantId: string,
    dto: CreateOrderDto,
  ): Promise<ResolvedShipping> {
    if (!dto.shippingMethodId) {
      this.throwOrderBadRequest(
        'INVALID_SHIPPING_METHOD',
        'Shipping method is required',
      );
    }

    const method = await this.repo.findActiveShippingMethodById(
      dto.shippingMethodId,
      tenantId,
    );
    if (!method) {
      this.throwOrderBadRequest(
        'INVALID_SHIPPING_METHOD',
        'Shipping method is not available',
      );
    }

    const location = this.resolveShippingLocation(
      method,
      dto.shippingLocationId,
    );
    const cost = this.roundMoney(
      this.toMoney(method.basePrice) + this.toMoney(location?.extraPrice),
    );

    return {
      method,
      ...(location ? { location } : {}),
      cost,
    };
  }

  buildTrustedShippingData(
    shippingData: Record<string, unknown>,
    shipping: ResolvedShipping,
  ) {
    return {
      address: this.getShippingAddressSnapshot(shippingData),
      method: {
        documentId: shipping.method.id,
        name: shipping.method.name,
        type: shipping.method.type,
      },
      ...(shipping.location
        ? {
            location: {
              documentId: shipping.location.id,
              key: shipping.location.key,
              label: shipping.location.label,
            },
          }
        : {}),
    };
  }

  private resolveShippingLocation(
    method: OrderShippingMethodForCheckout,
    shippingLocationId?: string,
  ): OrderShippingLocationForCheckout | undefined {
    if (!shippingLocationId && method.logistics.length > 0) {
      this.throwOrderBadRequest(
        'INVALID_SHIPPING_LOCATION',
        'Shipping location is required',
      );
    }

    if (!shippingLocationId) return undefined;

    const location = method.logistics.find(
      (candidate) =>
        candidate.id === shippingLocationId ||
        candidate.key === shippingLocationId,
    );

    if (!location) {
      this.throwOrderBadRequest(
        'INVALID_SHIPPING_LOCATION',
        'Shipping location is not available',
      );
    }

    return location;
  }

  private getShippingAddressSnapshot(
    shippingData: Record<string, unknown>,
  ): Record<string, unknown> {
    const address = shippingData.address;
    if (!address || typeof address !== 'object') {
      return {};
    }

    return address as Record<string, unknown>;
  }

  private toMoney(value: unknown): number {
    if (value === null || value === undefined) return 0;

    const amount = Number(value);
    return Number.isFinite(amount) ? this.roundMoney(amount) : 0;
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private throwOrderBadRequest(code: string, message: string): never {
    throw new BadRequestException({ code, message });
  }
}
