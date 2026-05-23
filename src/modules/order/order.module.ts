import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderRepository } from './order.repository';
import { OrderIntegrityService } from './order-integrity.service';
import { OrderStockService } from './order-stock.service';
import { OrderPricingService } from './order-pricing.service';
import { OrderItemIntegrityService } from './order-item-integrity.service';
import { OrderShippingIntegrityService } from './order-shipping-integrity.service';

@Module({
  controllers: [OrderController],
  providers: [
    OrderService,
    OrderIntegrityService,
    OrderItemIntegrityService,
    OrderPricingService,
    OrderShippingIntegrityService,
    OrderStockService,
    OrderRepository,
  ],
  exports: [OrderRepository, OrderStockService],
})
export class OrderModule {}
