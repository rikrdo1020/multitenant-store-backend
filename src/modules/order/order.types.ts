import {
  OrderStatus,
  Prisma,
  ProductStatus,
  ShippingType,
  UserRole,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export interface OrderListFilter {
  status?: OrderStatus;
  customerId?: string;
  customerEmail?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface AuthenticatedOrderUser {
  sub: string;
  email: string;
  role: UserRole;
  tenantId?: string;
}

export interface OrderFilter {
  tenantId: string;
  status?: OrderStatus;
  customerId?: string;
  customerEmail?: string;
  search?: string;
}

export interface OrderCustomerSnapshot {
  name: string;
  email: string;
  phone: string;
  notes?: string;
  address?: string;
  city?: string;
}

export interface OrderProductForCheckout {
  id: string;
  name: string;
  price: Decimal;
  discountPrice: Decimal | null;
  stock: number;
  productStatus: ProductStatus;
  type: string | null;
  images: string[];
}

export interface OrderShippingLocationForCheckout {
  id: string;
  key: string;
  label: string;
  extraPrice: Decimal | null;
}

export interface OrderShippingMethodForCheckout {
  id: string;
  name: string;
  type: ShippingType;
  basePrice: Decimal | null;
  requiresDetails: boolean;
  disclaimer: string | null;
  logistics: OrderShippingLocationForCheckout[];
}

export interface OrderComboForPricing {
  id: string;
  price: Decimal;
  isActive: boolean;
  rules: Prisma.JsonValue;
}
