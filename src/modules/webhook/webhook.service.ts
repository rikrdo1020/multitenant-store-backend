import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

export interface StripeWebhookEvent {
  type: string;
  data: { object: Record<string, unknown> };
}

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(private readonly prisma: PrismaService) {}

  async handleStripe(event: StripeWebhookEvent, tenantId: string): Promise<void> {
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

    await this.prisma.order.updateMany({
      where: { orderId, tenantId },
      data: { orderStatus: OrderStatus.paid, transactionId },
    });

    this.logger.log(`Order ${orderId} marked as paid (txn: ${transactionId})`);
  }

  private async handlePaymentFailed(
    object: Record<string, unknown>,
    tenantId: string,
  ): Promise<void> {
    const metadata = object['metadata'] as Record<string, string> | undefined;
    const orderId = metadata?.['orderId'];

    if (!orderId) return;

    await this.prisma.order.updateMany({
      where: { orderId, tenantId },
      data: { orderStatus: OrderStatus.failed },
    });

    this.logger.warn(`Order ${orderId} payment failed`);
  }

  private async handleSessionExpired(
    object: Record<string, unknown>,
    tenantId: string,
  ): Promise<void> {
    const metadata = object['metadata'] as Record<string, string> | undefined;
    const orderId = metadata?.['orderId'];

    if (!orderId) return;

    await this.prisma.order.updateMany({
      where: { orderId, tenantId, orderStatus: OrderStatus.pending },
      data: { orderStatus: OrderStatus.expired },
    });

    this.logger.log(`Order ${orderId} expired`);
  }
}
