import {
  OrderShippingLocationForCheckout,
  OrderShippingMethodForCheckout,
} from './order.types';

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
  pricingBreakdown: OrderPricingBreakdown;
  total: number;
}

export interface OrderPricingBreakdown {
  subtotal: number;
  discount: number;
  shippingCost: number;
  tax: number;
  total: number;
}

export interface ResolvedShipping {
  method: OrderShippingMethodForCheckout;
  location?: OrderShippingLocationForCheckout;
  cost: number;
}
