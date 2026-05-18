import { Module } from '@nestjs/common';
import { WebhookController, YappyIpnController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  controllers: [WebhookController, YappyIpnController],
  providers: [WebhookService],
})
export class WebhookModule {}
