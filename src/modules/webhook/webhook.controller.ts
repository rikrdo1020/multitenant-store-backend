import {
  Body,
  Controller,
  Get,
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

  @Public()
  @Get('yappy')
  @HttpCode(HttpStatus.OK)
  async yappyWebhook(
    @Query('orderId') orderId: string,
    @Query('status') status: string,
    @Query('domain') domain: string,
    @Query('hash') hash: string,
  ) {
    await this.webhookService.handleYappy({ orderId, status, domain, hash });
    return 'OK';
  }
}

// Yappy SDK hardcodes ipnUrl as `${siteUrl}/api/payments/yappy/webhook` — no global prefix.
@Controller('api/payments/yappy')
export class YappyIpnController {
  constructor(private readonly webhookService: WebhookService) {}

  @Public()
  @Get('webhook')
  @HttpCode(HttpStatus.OK)
  async yappyIpn(
    @Query('orderId') orderId: string,
    @Query('status') status: string,
    @Query('domain') domain: string,
    @Query('hash') hash: string,
  ) {
    await this.webhookService.handleYappy({ orderId, status, domain, hash });
    return 'OK';
  }
}
