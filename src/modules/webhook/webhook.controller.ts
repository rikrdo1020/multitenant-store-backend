import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { Public } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { WebhookService } from './webhook.service';

@Controller('webhooks')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

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

  /**
   * Yappy sends GET callbacks (not POST) with orderId, status, domain, hash query params.
   * Hash is validated via HMAC-SHA256 before updating the order status.
   */
  @Public()
  @Get('yappy')
  @HttpCode(HttpStatus.OK)
  async yappyWebhook(
    @Query('orderId') orderId: string,
    @Query('status') status: string,
    @Query('domain') domain: string,
    @Query('hash') hash: string,
    @CurrentTenant() tenant: Tenant,
  ) {
    await this.webhookService.handleYappy({ orderId, status, domain, hash }, tenant.id);
    return 'OK';
  }
}
