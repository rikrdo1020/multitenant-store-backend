import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { Public } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentService } from './payment.service';

@Controller('payments')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Public()
  @Post(':provider/create')
  @HttpCode(HttpStatus.OK)
  create(
    @Param('provider') provider: string,
    @Body() dto: CreatePaymentDto,
    @CurrentTenant() tenant: Tenant,
  ) {
    return this.paymentService.createPaymentForOrder(provider, dto, tenant.id);
  }
}
