import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { OrderItemDto, CreateOrderDto } from './dto/create-order.dto';
import {
  OrderProductForCheckout,
  OrderRepository,
  OrderShippingLocationForCheckout,
  OrderShippingMethodForCheckout,
} from './order.repository';

export interface TrustedOrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  imageUrl?: string;
  type?: string;
  selectedOptions?: Record<string, string>;
}

export interface TrustedOrderPayload {
  items: TrustedOrderItem[];
  shippingData: Record<string, unknown>;
  shippingCost: number;
  shippingMethodId: string;
  shippingLocationId?: string;
  total: number;
}

interface ResolvedShipping {
  method: OrderShippingMethodForCheckout;
  location?: OrderShippingLocationForCheckout;
  cost: number;
}

@Injectable()
export class OrderIntegrityService {
  constructor(private readonly repo: OrderRepository) {}

  async prepareOrder(
    tenantId: string,
    dto: CreateOrderDto,
  ): Promise<TrustedOrderPayload> {
    const items = await this.buildTrustedOrderItems(tenantId, dto.items);
    const shipping = await this.resolveShipping(tenantId, dto);
    const subtotal = items.reduce(
      (sum, item) => sum + item.unitPrice * item.quantity,
      0,
    );

    return {
      items,
      shippingData: this.buildTrustedShippingData(dto.shippingData, shipping),
      shippingCost: shipping.cost,
      shippingMethodId: shipping.method.id,
      shippingLocationId: shipping.location?.id,
      total: this.roundMoney(subtotal + shipping.cost),
    };
  }

  private async buildTrustedOrderItems(
    tenantId: string,
    items: OrderItemDto[],
  ): Promise<TrustedOrderItem[]> {
    if (!items.length) {
      this.throwOrderBadRequest(
        'ORDER_EMPTY_CART',
        'Order must include at least one item',
      );
    }

    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await this.repo.findProductsByIds(productIds, tenantId);
    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const requestedQuantityByProduct =
      this.getRequestedQuantityByProduct(items);

    return items.map((item) => {
      const product = productsById.get(item.productId);
      if (!product) {
        this.throwOrderBadRequest(
          'ORDER_PRODUCT_NOT_FOUND',
          'Product not found for this tenant',
        );
      }

      this.assertProductCanBeOrdered(
        product,
        requestedQuantityByProduct.get(product.id) ?? item.quantity,
      );
      const unitPrice = this.getTrustedProductPrice(product);

      return {
        productId: product.id,
        name: product.name,
        quantity: item.quantity,
        unitPrice,
        ...(product.images[0] ? { imageUrl: product.images[0] } : {}),
        ...(product.type ? { type: product.type } : {}),
        ...(item.selectedOptions
          ? { selectedOptions: item.selectedOptions }
          : {}),
      };
    });
  }

  private getRequestedQuantityByProduct(
    items: OrderItemDto[],
  ): Map<string, number> {
    return items.reduce((requested, item) => {
      requested.set(
        item.productId,
        (requested.get(item.productId) ?? 0) + item.quantity,
      );
      return requested;
    }, new Map<string, number>());
  }

  private assertProductCanBeOrdered(
    product: OrderProductForCheckout,
    requestedQuantity: number,
  ) {
    if (product.productStatus !== ProductStatus.published) {
      this.throwOrderBadRequest(
        'ORDER_PRODUCT_UNAVAILABLE',
        'Product is not available for purchase',
      );
    }

    if (requestedQuantity > product.stock) {
      this.throwOrderBadRequest(
        'ORDER_INSUFFICIENT_STOCK',
        'Requested quantity exceeds available stock',
      );
    }
  }

  private getTrustedProductPrice(product: OrderProductForCheckout): number {
    return this.toMoney(product.discountPrice ?? product.price);
  }

  private async resolveShipping(
    tenantId: string,
    dto: CreateOrderDto,
  ): Promise<ResolvedShipping> {
    if (!dto.shippingMethodId) {
      this.throwOrderBadRequest(
        'ORDER_SHIPPING_METHOD_INVALID',
        'Shipping method is required',
      );
    }

    const method = await this.repo.findActiveShippingMethodById(
      dto.shippingMethodId,
      tenantId,
    );
    if (!method) {
      this.throwOrderBadRequest(
        'ORDER_SHIPPING_METHOD_INVALID',
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

  private resolveShippingLocation(
    method: OrderShippingMethodForCheckout,
    shippingLocationId?: string,
  ): OrderShippingLocationForCheckout | undefined {
    if (!shippingLocationId && method.logistics.length > 0) {
      this.throwOrderBadRequest(
        'ORDER_SHIPPING_LOCATION_INVALID',
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
        'ORDER_SHIPPING_LOCATION_INVALID',
        'Shipping location is not available',
      );
    }

    return location;
  }

  private buildTrustedShippingData(
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
