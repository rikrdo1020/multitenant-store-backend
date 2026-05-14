import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { WebhookService } from './webhook.service';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { Tenant } from '@prisma/client';
import { Public } from '../../common/decorators/roles.decorator';

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  /**
   * Stripe sends a raw body for signature verification.
   * In production, verify the Stripe-Signature header against the raw body
   * using stripe.webhooks.constructEvent() before processing.
   *
   * The tenant is resolved from the x-tenant-id header by TenantMiddleware.
   */
  @Public()
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  async stripeWebhook(
    @Body() event: { type: string; data: { object: Record<string, unknown> } },
    @CurrentTenant() tenant: Tenant,
  ) {
    await this.webhookService.handleStripe(event, tenant.id);
    return { received: true };
  }
}
