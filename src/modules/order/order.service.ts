import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderRepository } from './order.repository';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { TrackOrderDto } from './dto/track-order.dto';
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
import { OrderEmailService } from './order-email.service';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class OrderService {
  constructor(
    private readonly repo: OrderRepository,
    private readonly integrity: OrderIntegrityService,
    private readonly stock: OrderStockService,
    private readonly emails: OrderEmailService,
    private readonly notifications: NotificationService,
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

  async findPublicTracking(
    value: string,
    tenantId: string,
    viewToken?: string,
  ) {
    if (viewToken?.trim()) {
      const order = await this.repo.findByOrderIdAndViewTokenHash(
        value,
        tenantId,
        hashOrderViewToken(viewToken),
      );
      if (!order) {
        throw new NotFoundException({
          code: 'ORDER_NOT_FOUND',
          message: 'Order not found',
        });
      }
      return this.serializePublicTrackingOrder(order);
    }

    if (!value?.trim()) {
      throw new BadRequestException({
        code: 'ORDER_TRACKING_TOKEN_REQUIRED',
        message: 'Order tracking token is required',
      });
    }

    const order = await this.repo.findByViewTokenHash(
      tenantId,
      hashOrderViewToken(value),
    );
    if (!order)
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    return this.serializePublicTrackingOrder(order);
  }

  async findPublicTrackingByEmail(tenantId: string, dto: TrackOrderDto) {
    const order = await this.repo.findByOrderIdAndCustomerEmail(
      dto.orderId,
      tenantId,
      this.normalizeEmail(dto.email),
    );
    if (!order) {
      throw new NotFoundException({
        code: 'ORDER_NOT_FOUND',
        message: 'Order not found',
      });
    }

    return this.serializePublicTrackingOrder(order);
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
        pricingBreakdown: trustedOrder.pricingBreakdown as any,
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

    void this.notifyTenantMembers(tenantId, {
      title: 'Nueva orden recibida',
      body: `Orden ${orderId} de ${customerData.name}`,
      type: 'order_created',
      metadata: { orderId: order.id, orderRef: orderId },
    }).catch(() => undefined);

    void this.emails
      .sendOrderCreated(order, viewToken)
      .catch(() => undefined);
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

    return this.updateStatus(id, tenantId, dto, user.sub);
  }

  async updateStatus(
    id: string,
    tenantId: string,
    dto: UpdateOrderStatusDto,
    changedBy?: string,
  ) {
    const updated = await this.stock.transitionOrderStatusById(id, tenantId, {
      ...(dto.orderStatus && { orderStatus: dto.orderStatus }),
      ...(dto.transactionId !== undefined && {
        transactionId: dto.transactionId,
      }),
      ...(dto.confirmationNumber !== undefined && {
        confirmationNumber: dto.confirmationNumber,
      }),
      ...(dto.dispatched !== undefined && { dispatched: dto.dispatched }),
      ...(dto.trackingNumber !== undefined && {
        trackingNumber: dto.trackingNumber,
      }),
      ...(dto.trackingCarrier !== undefined && {
        trackingCarrier: dto.trackingCarrier,
      }),
      ...(dto.trackingUrl !== undefined && { trackingUrl: dto.trackingUrl }),
      ...(dto.adminNote !== undefined && { adminNote: dto.adminNote }),
      ...(changedBy !== undefined && { changedBy }),
    });

    void this.emails
      .sendOrderStatusNotification(updated)
      .catch(() => undefined);
    if (dto.orderStatus) {
      void this.notifyTenantMembers(tenantId, {
        title: 'Estado de orden actualizado',
        body: `Orden ${updated.orderId} cambio a ${dto.orderStatus}`,
        type: 'order_status_changed',
        metadata: { orderId: updated.id, orderRef: updated.orderId, status: dto.orderStatus },
      }).catch(() => undefined);
    }

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

  private async notifyTenantMembers(
    tenantId: string,
    payload: { title: string; body: string; type: 'order_created' | 'order_status_changed'; metadata?: Record<string, unknown> },
  ): Promise<void> {
    const userIds = await this.repo.findTenantMemberUserIds(tenantId);
    await Promise.all(
      userIds.map((userId) =>
        this.notifications.send({ userId, ...payload }).catch(() => undefined),
      ),
    );
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

  private serializePublicTrackingOrder(order: unknown): unknown {
    const safeOrder = this.omitSensitiveOrderFields(order);

    return serialize({
      id: safeOrder.id,
      orderId: safeOrder.orderId,
      orderStatus: safeOrder.orderStatus,
      items: safeOrder.items,
      customerData: this.maskCustomerData(safeOrder.customerData),
      shippingData: this.maskShippingData(safeOrder.shippingData),
      pricingBreakdown: safeOrder.pricingBreakdown,
      shippingCost: safeOrder.shippingCost,
      total: safeOrder.total,
      paymentMethod: safeOrder.paymentMethod,
      trackingNumber: safeOrder.trackingNumber,
      trackingCarrier: safeOrder.trackingCarrier,
      trackingUrl: safeOrder.trackingUrl,
      statusHistory: this.getPublicStatusHistory(safeOrder.statusHistory),
      createdAt: safeOrder.createdAt,
      updatedAt: safeOrder.updatedAt,
    });
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

  private maskCustomerData(customerData: unknown): Record<string, unknown> {
    if (!customerData || typeof customerData !== 'object') return {};

    const snapshot = customerData as Record<string, unknown>;

    return {
      ...(typeof snapshot.name === 'string' && {
        name: this.maskName(snapshot.name),
      }),
      ...(typeof snapshot.email === 'string' && {
        email: this.maskEmail(snapshot.email),
      }),
      ...(typeof snapshot.phone === 'string' && {
        phone: this.maskPhone(snapshot.phone),
      }),
    };
  }

  private getPublicStatusHistory(statusHistory: unknown): unknown[] {
    if (!Array.isArray(statusHistory)) return [];

    return statusHistory.flatMap((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return [];
      }

      const snapshot = entry as Record<string, unknown>;
      return [
        {
          status: snapshot.status,
          note: snapshot.note,
          createdAt: snapshot.createdAt,
        },
      ];
    });
  }

  private maskShippingData(shippingData: unknown): Record<string, unknown> {
    if (!shippingData || typeof shippingData !== 'object') return {};

    const snapshot = shippingData as Record<string, unknown>;
    const address = snapshot.address;

    return {
      ...snapshot,
      ...(address && typeof address === 'object' && !Array.isArray(address)
        ? {
            address: this.maskAddressSnapshot(
              address as Record<string, unknown>,
            ),
          }
        : {}),
    };
  }

  private maskAddressSnapshot(address: Record<string, unknown>) {
    return {
      ...(typeof address.address === 'string' && {
        address: this.maskAddress(address.address),
      }),
      ...(typeof address.city === 'string' && { city: address.city }),
      ...(typeof address.department === 'string' && {
        department: address.department,
      }),
    };
  }

  private maskName(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length <= 1) return '*';
    return `${trimmed[0]}***`;
  }

  private maskEmail(email: string): string {
    const [local, domain] = email.split('@');
    if (!local || !domain) return '***';
    return `${local[0]}***@${domain}`;
  }

  private maskPhone(phone: string): string {
    const trimmed = phone.trim();
    if (trimmed.startsWith('+')) {
      const [prefix] = trimmed.split(/\s+/);
      return `${prefix} ***-****`;
    }
    return '***-****';
  }

  private maskAddress(address: string): string {
    const trimmed = address.trim();
    if (trimmed.length <= 6) return '***';
    return `${trimmed.slice(0, 6)}***`;
  }
}
