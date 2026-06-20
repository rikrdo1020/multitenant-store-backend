import { Module } from '@nestjs/common';
import { WebhookController, YappyIpnController } from './webhook.controller';
import { WebhookService } from './webhook.service';
import { OrderModule } from '../order/order.module';

@Module({
  imports: [OrderModule],
  controllers: [WebhookController, YappyIpnController],
  providers: [WebhookService],
})
export class WebhookModule {}
