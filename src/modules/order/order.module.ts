import { Module } from '@nestjs/common';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';
import { OrderRepository } from './order.repository';
import { OrderIntegrityService } from './order-integrity.service';

@Module({
  controllers: [OrderController],
  providers: [OrderService, OrderIntegrityService, OrderRepository],
})
export class OrderModule {}
