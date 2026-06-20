import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrderStockService } from './order-stock.service';

@Injectable()
export class OrderReservationExpirationService {
  private readonly logger = new Logger(OrderReservationExpirationService.name);

  constructor(private readonly stock: OrderStockService) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async expirePendingReservations(): Promise<void> {
    const expiredCount = await this.stock.expirePendingReservations(15);
    if (expiredCount > 0) {
      this.logger.log(`Expired ${expiredCount} pending order reservations`);
    }
  }
}
