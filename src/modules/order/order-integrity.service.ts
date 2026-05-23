import { Injectable } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  TrustedOrderItem,
  TrustedOrderPayload,
} from './order-integrity.types';
import { OrderItemIntegrityService } from './order-item-integrity.service';
import { OrderPricingService, PricingCalculation } from './order-pricing.service';
import { OrderRepository } from './order.repository';
import { OrderShippingIntegrityService } from './order-shipping-integrity.service';

@Injectable()
export class OrderIntegrityService {
  constructor(
    private readonly repo: OrderRepository,
    private readonly items: OrderItemIntegrityService,
    private readonly pricing: OrderPricingService,
    private readonly shipping: OrderShippingIntegrityService,
  ) {}

  async prepareOrder(
    tenantId: string,
    dto: CreateOrderDto,
  ): Promise<TrustedOrderPayload> {
    const items = await this.items.buildTrustedOrderItems(tenantId, dto.items);
    const shipping = await this.shipping.resolveShipping(tenantId, dto);
    const pricing = await this.calculatePricing(tenantId, items);

    return {
      items,
      shippingData: this.shipping.buildTrustedShippingData(
        dto.shippingData,
        shipping,
      ),
      shippingCost: shipping.cost,
      shippingMethodId: shipping.method.id,
      shippingLocationId: shipping.location?.id,
      total: this.roundMoney(pricing.subtotal + shipping.cost),
    };
  }

  private async calculatePricing(
    tenantId: string,
    items: TrustedOrderItem[],
  ): Promise<PricingCalculation> {
    const combos = await this.repo.findActiveCombos(tenantId);
    return this.pricing.calculate(items, combos);
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
