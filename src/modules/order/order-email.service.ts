import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailAction, Order, OrderStatus, UserRole } from '@prisma/client';
import { ResendService, SendEmailPolicy } from '../../lib/resend/resend.service';
import { normalizeEmail } from '../../common/utils/privacy';
import { OrderRepository } from './order.repository';
import {
  buildOrderEmailHtml,
  isEmail,
  orderStatusLabel,
  OrderEmailSummary,
  SenderSettings,
} from './order-email-content';

@Injectable()
export class OrderEmailService {
  private readonly logger = new Logger(OrderEmailService.name);

  constructor(
    private readonly repo: OrderRepository,
    private readonly resend: ResendService,
    private readonly config: ConfigService,
  ) {}

  async sendOrderCreated(order: Order, viewToken?: string): Promise<void> {
    const context = await this.repo.findTenantEmailContext(order.tenantId);
    if (!context) return;

    const sender = this.resolveSender(context.settings);
    const summary = this.buildSummary(
      order,
      context.name,
      context.settings?.currency,
      undefined,
      viewToken,
      context.slug,
    );
    const customerEmail = this.getCustomerEmail(order.customerData);

    if (customerEmail) {
      await this.sendSafely('customer order-created', order.orderId, () =>
        this.sendOrderEmail({
          to: customerEmail,
          subject: `Orden recibida ${summary.orderId}`,
          intro: 'Recibimos tu orden y la estamos preparando para el siguiente paso.',
          actionText: `Guarda este numero para seguimiento: ${summary.orderId}.`,
          summary,
          policy: this.policy(EmailAction.order_created_customer, order, customerEmail),
          sender,
        }),
      );
    }

    await Promise.allSettled(
      this.adminRecipients(context).map((email) =>
        this.sendSafely('admin order-created', order.orderId, () =>
          this.sendOrderEmail({
            to: email,
            subject: `Nueva orden ${summary.orderId}`,
            intro: `Hay una nueva orden para ${summary.tenantName ?? 'tu tienda'}.`,
            actionText: `Revisa la orden ${summary.orderId} en el panel admin.`,
            summary,
            policy: this.policy(EmailAction.order_created_admin, order, email),
            sender,
          }),
        ),
      ),
    );
  }

  async sendOrderStatusNotification(order: Order): Promise<void> {
    const context = await this.repo.findTenantEmailContext(order.tenantId);
    if (!context) return;

    const customerEmail = this.getCustomerEmail(order.customerData);
    if (!customerEmail) return;

    const sender = this.resolveSender(context.settings);
    const action = order.orderStatus === OrderStatus.paid
      ? EmailAction.payment_confirmed
      : EmailAction.order_status_changed;
    const summary = this.buildSummary(
      order,
      context.name,
      context.settings?.currency,
      orderStatusLabel(order.orderStatus),
      undefined,
      context.slug,
    );

    await this.sendSafely('customer order-status', order.orderId, () => {
      if (action === EmailAction.payment_confirmed) {
        return this.sendOrderEmail({
          to: customerEmail,
          subject: `Pago confirmado ${summary.orderId}`,
          intro: 'Tu pago fue confirmado correctamente.',
          actionText: 'Te avisaremos cuando la orden avance en preparacion.',
          summary,
          policy: this.policy(action, order, customerEmail),
          sender,
        });
      }

      return this.sendOrderEmail({
        to: customerEmail,
        subject: `Actualizacion de orden ${summary.orderId}`,
        intro: `Tu orden cambio de estado a ${summary.status ?? 'actualizado'}.`,
        actionText: 'Gracias por comprar con nosotros.',
        summary,
        policy: this.policy(action, order, customerEmail),
        sender,
      });
    });
  }

  private sendOrderEmail(input: {
    to: string;
    subject: string;
    intro: string;
    actionText: string;
    summary: OrderEmailSummary;
    policy: SendEmailPolicy;
    sender: SenderSettings;
  }): Promise<void> {
    return this.resend.sendEmail(
      {
        to: input.to,
        subject: input.subject,
        from: input.sender.fromEmail,
        fromName: input.sender.fromName,
        html: buildOrderEmailHtml(input),
      },
      input.policy,
    );
  }

  private buildSummary(
    order: Order,
    tenantName: string,
    currency = 'USD',
    status?: string,
    viewToken?: string,
    tenantSlug?: string,
  ): OrderEmailSummary {
    return {
      orderId: order.orderId,
      total: Number(order.total),
      tenantName,
      customerName: this.getCustomerName(order.customerData),
      currency,
      status,
      trackingUrl: this.buildTrackingUrl(order.orderId, tenantSlug, viewToken),
      trackingNumber: order.trackingNumber ?? undefined,
      trackingCarrier: order.trackingCarrier ?? undefined,
      items: this.getItems(order.items),
      pricing: this.getPricing(order),
    };
  }

  private policy(
    action: EmailAction,
    order: Order,
    recipient: string,
  ): SendEmailPolicy {
    return {
      action,
      recipient,
      actorKey: order.orderId,
      tenantId: order.tenantId,
      dedupeKey: `${order.id}:${order.orderStatus}:${recipient}`,
    };
  }

  private adminRecipients(context: Awaited<ReturnType<OrderRepository['findTenantEmailContext']>>): string[] {
    if (!context) return [];

    const emails = new Set<string>();
    emails.add(normalizeEmail(context.owner.email));

    for (const member of context.members) {
      if (member.role === UserRole.admin) {
        emails.add(normalizeEmail(member.user.email));
      }
    }

    return [...emails];
  }

  private getCustomerEmail(customerData: unknown): string | undefined {
    const email = this.getStringField(customerData, 'email');
    return email ? normalizeEmail(email) : undefined;
  }

  private getCustomerName(customerData: unknown): string | undefined {
    return this.getStringField(customerData, 'name');
  }

  private getStringField(source: unknown, field: string): string | undefined {
    if (!source || typeof source !== 'object' || Array.isArray(source)) {
      return undefined;
    }

    const value = (source as Record<string, unknown>)[field];
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private getItems(items: unknown): OrderEmailSummary['items'] {
    if (!Array.isArray(items)) return [];

    return items.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];

      const snapshot = item as Record<string, unknown>;
      const name = snapshot.name;
      const quantity = Number(snapshot.quantity);
      const unitPrice = Number(snapshot.unitPrice);

      if (
        typeof name !== 'string' ||
        !Number.isFinite(quantity) ||
        !Number.isFinite(unitPrice)
      ) {
        return [];
      }

      return [{ name, quantity, unitPrice }];
    });
  }

  private getPricing(order: Order): OrderEmailSummary['pricing'] {
    const breakdown = order.pricingBreakdown;
    if (breakdown && typeof breakdown === 'object' && !Array.isArray(breakdown)) {
      const snapshot = breakdown as Record<string, unknown>;
      return {
        subtotal: this.toMoney(snapshot.subtotal),
        discount: this.toMoney(snapshot.discount),
        shippingCost: this.toMoney(snapshot.shippingCost),
        tax: this.toMoney(snapshot.tax),
        total: this.toMoney(snapshot.total),
      };
    }

    return {
      subtotal: Number(order.total),
      discount: 0,
      shippingCost: Number(order.shippingCost),
      tax: 0,
      total: Number(order.total),
    };
  }

  private buildTrackingUrl(
    orderId: string,
    tenantSlug?: string,
    viewToken?: string,
  ): string {
    const trackingUrl = new URL(
      this.config.get<string>('ORDER_TRACKING_URL') ?? 'multitenant://track',
    );
    if (tenantSlug) {
      trackingUrl.searchParams.set('tenantSlug', tenantSlug);
    }
    trackingUrl.searchParams.set('orderId', orderId);
    if (viewToken) {
      trackingUrl.searchParams.set('token', viewToken);
    }
    return trackingUrl.toString();
  }

  private toMoney(value: unknown): number {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : 0;
  }

  private resolveSender(settings?: {
    emailFrom: string | null;
    emailFromName: string | null;
  } | null): SenderSettings {
    if (!settings?.emailFrom || !isEmail(settings.emailFrom)) {
      return {};
    }

    return {
      fromEmail: normalizeEmail(settings.emailFrom),
      fromName: settings.emailFromName?.trim() || undefined,
    };
  }

  private async sendSafely(
    label: string,
    orderId: string,
    send: () => Promise<void>,
  ): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.logger.warn(
        `Non-blocking ${label} email failed for order ${orderId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
