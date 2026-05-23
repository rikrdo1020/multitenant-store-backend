import { BadRequestException, Injectable } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { OrderItemDto } from './dto/create-order.dto';
import { TrustedOrderItem } from './order-integrity.types';
import { OrderRepository } from './order.repository';
import { OrderProductForCheckout } from './order.types';

@Injectable()
export class OrderItemIntegrityService {
  constructor(private readonly repo: OrderRepository) {}

  async buildTrustedOrderItems(
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

      return {
        productId: product.id,
        name: product.name,
        quantity: item.quantity,
        unitPrice: this.getTrustedProductPrice(product),
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
