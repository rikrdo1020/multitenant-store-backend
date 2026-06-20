import { Injectable } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  OrderPricingBreakdown,
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
    const pricingBreakdown = await this.buildPricingBreakdown(
      tenantId,
      pricing,
      shipping.cost,
    );

    return {
      items,
      shippingData: this.shipping.buildTrustedShippingData(
        dto.shippingData,
        shipping,
      ),
      shippingCost: shipping.cost,
      shippingMethodId: shipping.method.id,
      shippingLocationId: shipping.location?.id,
      pricingBreakdown,
      total: pricingBreakdown.total,
    };
  }

  private async calculatePricing(
    tenantId: string,
    items: TrustedOrderItem[],
  ): Promise<PricingCalculation> {
    const combos = await this.repo.findActiveCombos(tenantId);
    return this.pricing.calculate(items, combos);
  }

  private async buildPricingBreakdown(
    tenantId: string,
    pricing: PricingCalculation,
    shippingCost: number,
  ): Promise<OrderPricingBreakdown> {
    const settings = await this.repo.findTenantPricingSettings(tenantId);
    const taxRate = this.toMoney(settings?.taxRate) / 100;
    const subtotal = pricing.originalSubtotal;
    const discount = pricing.savings;
    const taxableAmount = pricing.subtotal;
    const tax = this.roundMoney(taxableAmount * taxRate);
    const total = this.roundMoney(taxableAmount + shippingCost + tax);

    return {
      subtotal,
      discount,
      shippingCost,
      tax,
      total,
    };
  }

  private toMoney(value: unknown): number {
    if (value === null || value === undefined) return 0;

    const amount = Number(value);
    return Number.isFinite(amount) ? this.roundMoney(amount) : 0;
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
