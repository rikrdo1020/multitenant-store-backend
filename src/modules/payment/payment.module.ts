import { Module } from '@nestjs/common';
import { CashProvider } from './providers/cash.provider';
import { YappyProvider } from './providers/yappy.provider';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';

@Module({
  controllers: [PaymentController],
  providers: [PaymentService, YappyProvider, CashProvider],
  exports: [PaymentService],
})
export class PaymentModule {}
