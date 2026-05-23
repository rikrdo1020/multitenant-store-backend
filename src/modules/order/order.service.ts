import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderRepository } from './order.repository';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UserRole } from '@prisma/client';
import { serialize, serializeList } from '../../common/utils/serializer';
import { nanoid } from 'nanoid';
import { OrderIntegrityService } from './order-integrity.service';
import { OrderStockService } from './order-stock.service';
import { AuthenticatedOrderUser, OrderListFilter } from './order.types';
import {
  generateOrderViewToken,
  hashOrderViewToken,
} from './order-view-token';

@Injectable()
export class OrderService {
  constructor(
    private readonly repo: OrderRepository,
    private readonly integrity: OrderIntegrityService,
    private readonly stock: OrderStockService,
  ) {}

  async findAll(tenantId: string, filter: OrderListFilter = {}) {
    const page = filter.page ?? 1;
    const pageSize = filter.pageSize ?? 20;
    const skip = (page - 1) * pageSize;
    const scopedFilter = {
      tenantId,
      status: filter.status,
      customerId: filter.customerId,
      customerEmail: filter.customerEmail,
      search: filter.search,
    };

    const [items, total] = await Promise.all([
      this.repo.findMany(scopedFilter, skip, pageSize),
      this.repo.count(scopedFilter),
    ]);

    return this.serializeOrderList(items, { page, pageSize, total });
  }

  async findAllForUser(
    tenantId: string,
    user: AuthenticatedOrderUser,
    filter: OrderListFilter = {},
  ) {
    const canManageOrders = await this.canManageOrders(tenantId, user);
    if (canManageOrders) {
      return this.findAll(tenantId, filter);
    }

    return this.findAll(tenantId, {
      ...filter,
      customerId: undefined,
      customerEmail: this.normalizeEmail(user.email),
    });
  }

  async findById(id: string, tenantId: string) {
    const order = await this.repo.findById(id, tenantId);
    if (!order)
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    return this.serializeOrder(order);
  }

  async findByIdForUser(
    id: string,
    tenantId: string,
    user: AuthenticatedOrderUser,
  ) {
    const canManageOrders = await this.canManageOrders(tenantId, user);
    if (canManageOrders) {
      return this.findById(id, tenantId);
    }

    const order = await this.repo.findByIdForCustomerEmail(
      id,
      tenantId,
      this.normalizeEmail(user.email),
    );
    if (!order)
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    return this.serializeOrder(order);
  }

  async findByOrderIdForTracking(
    orderId: string,
    tenantId: string,
    viewToken?: string,
  ) {
    if (!viewToken?.trim()) {
      throw new BadRequestException({
        code: 'ORDER_TRACKING_TOKEN_REQUIRED',
        message: 'Order tracking token is required',
      });
    }

    const order = await this.repo.findByOrderIdAndViewTokenHash(
      orderId,
      tenantId,
      hashOrderViewToken(viewToken),
    );
    if (!order)
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    return this.serializeOrder(order);
  }

  async create(tenantId: string, dto: CreateOrderDto) {
    const orderId = `ORD-${nanoid(10).toUpperCase()}`;
    const viewToken = generateOrderViewToken();
    const customerData = {
      ...dto.customerData,
      email: this.normalizeEmail(dto.customerData.email),
    };
    const trustedOrder = await this.integrity.prepareOrder(tenantId, dto);
    const shippingAddress = this.extractShippingAddress(dto.shippingData);
    const customer = dto.customerId
      ? await this.repo.findCustomerById(dto.customerId, tenantId)
      : await this.repo.upsertCustomerFromOrder(tenantId, {
          ...customerData,
          ...shippingAddress,
        });

    if (!customer) {
      throw new NotFoundException({
        code: 'CUSTOMER_NOT_FOUND',
        message: 'Customer not found',
      });
    }

    const order = await this.stock.createOrderWithStockReservation(
      tenantId,
      {
        orderId,
        total: trustedOrder.total,
        shippingCost: trustedOrder.shippingCost,
        customerData: customerData as any,
        shippingData: trustedOrder.shippingData as any,
        items: trustedOrder.items as any,
        paymentMethod: dto.paymentMethod,
        viewTokenHash: hashOrderViewToken(viewToken),
        shippingMethodId: trustedOrder.shippingMethodId,
        shippingLocationId: trustedOrder.shippingLocationId,
        tenant: { connect: { id: tenantId } },
        customer: { connect: { id: customer.id } },
      },
      trustedOrder.items,
    );

    return this.serializeOrder(order, { viewToken });
  }

  async updateStatusForUser(
    id: string,
    tenantId: string,
    user: AuthenticatedOrderUser,
    dto: UpdateOrderStatusDto,
  ) {
    const canManageOrders = await this.canManageOrders(tenantId, user);
    if (!canManageOrders) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'User cannot manage orders for this tenant',
      });
    }

    return this.updateStatus(id, tenantId, dto);
  }

  async updateStatus(id: string, tenantId: string, dto: UpdateOrderStatusDto) {
    const updated = await this.stock.transitionOrderStatusById(id, tenantId, {
      ...(dto.orderStatus && { orderStatus: dto.orderStatus }),
      ...(dto.transactionId !== undefined && {
        transactionId: dto.transactionId,
      }),
      ...(dto.confirmationNumber !== undefined && {
        confirmationNumber: dto.confirmationNumber,
      }),
      ...(dto.dispatched !== undefined && { dispatched: dto.dispatched }),
    });

    return this.serializeOrder(updated);
  }

  private async canManageOrders(
    tenantId: string,
    user: AuthenticatedOrderUser,
  ): Promise<boolean> {
    if (user.role === UserRole.superadmin) return true;
    if (![UserRole.admin, UserRole.manager].includes(user.role)) return false;

    const membership = await this.repo.hasTenantMembership(user.sub, tenantId);
    return !!membership;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private serializeOrder(
    order: unknown,
    extra: Record<string, unknown> = {},
  ): unknown {
    return serialize({
      ...this.omitSensitiveOrderFields(order),
      ...extra,
    });
  }

  private serializeOrderList(
    items: unknown[],
    meta: { page: number; pageSize: number; total: number },
  ) {
    return serializeList(
      items.map((item) => this.omitSensitiveOrderFields(item)),
      meta,
    );
  }

  private omitSensitiveOrderFields(order: unknown): Record<string, unknown> {
    const { viewTokenHash: _viewTokenHash, ...safeOrder } = order as Record<
      string,
      unknown
    >;
    return safeOrder;
  }

  private extractShippingAddress(shippingData: Record<string, unknown>) {
    const address = shippingData.address;
    if (!address || typeof address !== 'object') {
      return {};
    }

    const snapshot = address as Record<string, unknown>;

    return {
      ...(typeof snapshot.address === 'string' && snapshot.address.trim()
        ? { address: snapshot.address.trim() }
        : {}),
      ...(typeof snapshot.city === 'string' && snapshot.city.trim()
        ? { city: snapshot.city.trim() }
        : {}),
    };
  }
}
