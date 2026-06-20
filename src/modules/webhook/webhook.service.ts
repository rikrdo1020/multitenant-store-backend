import * as crypto from 'crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { OrderEmailService } from '../order/order-email.service';
import { OrderStockService } from '../order/order-stock.service';

export interface StripeWebhookEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

export interface YappyWebhookParams {
  orderId: string;
  status: string;
  domain: string;
  hash: string;
}

const YAPPY_STATUS_MAP: Record<string, OrderStatus> = {
  E: OrderStatus.paid,
  R: OrderStatus.rejected,
  C: OrderStatus.cancelled,
  X: OrderStatus.expired,
};

function mapYappyStatus(code: string): OrderStatus {
  return YAPPY_STATUS_MAP[code] ?? OrderStatus.pending;
}

function validateYappyHash(
  secretKey: string,
  orderId: string,
  status: string,
  domain: string,
  hash: string,
): boolean {
  try {
    const rawKey = Buffer.from(secretKey, 'base64').toString('utf8');
    const secret = rawKey.split('.')[0];
    const computed = crypto
      .createHmac('sha256', secret)
      .update(orderId + status + domain)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(hash, 'hex'),
    );
  } catch {
    return false;
  }
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly orderStockService: OrderStockService,
    private readonly orderEmailService: OrderEmailService,
  ) {}

  async handleStripe(
    event: StripeWebhookEvent,
    tenantId: string,
  ): Promise<void> {
    this.logger.log(`Stripe webhook: ${event.type} for tenant ${tenantId}`);

    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.handlePaymentSucceeded(event.data.object, tenantId);
        break;

      case 'payment_intent.payment_failed':
        await this.handlePaymentFailed(event.data.object, tenantId);
        break;

      case 'checkout.session.expired':
        await this.handleSessionExpired(event.data.object, tenantId);
        break;

      default:
        this.logger.warn(`Unhandled Stripe event type: ${event.type}`);
    }
  }

  async handleYappy(params: YappyWebhookParams): Promise<void> {
    const secretKey = this.configService.get<string>('YAPPY_SECRET_KEY', '');

    const isValid = validateYappyHash(
      secretKey,
      params.orderId,
      params.status,
      params.domain,
      params.hash,
    );
    if (!isValid) {
      this.logger.warn(`Invalid Yappy hash for order ${params.orderId}`);
      throw new UnauthorizedException('Invalid hash');
    }

    const fullOrderId = `ORD-${params.orderId}`;
    const order = await this.orderStockService.transitionOrderStatusByOrderId(
      fullOrderId,
      undefined,
      {
        orderStatus: mapYappyStatus(params.status),
      },
    );
    if (!order) {
      this.logger.warn(`Yappy webhook: order ${params.orderId} not found`);
      return;
    }

    const mappedStatus = mapYappyStatus(params.status);
    await this.orderEmailService.sendOrderStatusNotification(order);

    this.logger.log(
      `Yappy webhook: order ORD-${params.orderId} -> ${mappedStatus}`,
    );
  }

  private async handlePaymentSucceeded(
    object: Record<string, unknown>,
    tenantId: string,
  ): Promise<void> {
    const transactionId = object['id'] as string;
    const metadata = object['metadata'] as Record<string, string> | undefined;
    const orderId = metadata?.['orderId'];

    if (!orderId) {
      this.logger.warn('payment_intent.succeeded missing orderId in metadata');
      return;
    }

    const order = await this.orderStockService.transitionOrderStatusByOrderId(
      orderId,
      tenantId,
      {
        orderStatus: OrderStatus.paid,
        transactionId,
      },
    );
    if (order) {
      await this.orderEmailService.sendOrderStatusNotification(order);
    }

    this.logger.log(`Order ${orderId} marked as paid (txn: ${transactionId})`);
  }

  private async handlePaymentFailed(
    object: Record<string, unknown>,
    tenantId: string,
  ): Promise<void> {
    const metadata = object['metadata'] as Record<string, string> | undefined;
    const orderId = metadata?.['orderId'];
    if (!orderId) return;

    const order = await this.orderStockService.transitionOrderStatusByOrderId(
      orderId,
      tenantId,
      {
        orderStatus: OrderStatus.failed,
      },
    );
    if (order) {
      await this.orderEmailService.sendOrderStatusNotification(order);
    }

    this.logger.warn(`Order ${orderId} payment failed`);
  }

  private async handleSessionExpired(
    object: Record<string, unknown>,
    tenantId: string,
  ): Promise<void> {
    const metadata = object['metadata'] as Record<string, string> | undefined;
    const orderId = metadata?.['orderId'];
    if (!orderId) return;

    const order = await this.orderStockService.transitionOrderStatusByOrderId(
      orderId,
      tenantId,
      { orderStatus: OrderStatus.expired },
      { onlyFrom: [OrderStatus.pending] },
    );
    if (order) {
      await this.orderEmailService.sendOrderStatusNotification(order);
    }

    this.logger.log(`Order ${orderId} expired`);
  }
}
