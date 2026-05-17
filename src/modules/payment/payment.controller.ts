import { BadRequestException, Body, Controller, HttpCode, HttpStatus, Logger, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, Tenant } from '@prisma/client';
import { Public } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { PaymentService } from './payment.service';

@Controller('payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(
    private readonly paymentService: PaymentService,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post(':provider/create')
  @HttpCode(HttpStatus.OK)
  async create(
    @Param('provider') provider: string,
    @Body() dto: CreatePaymentDto,
    @CurrentTenant() tenant: Tenant,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { orderId: dto.orderId, tenantId: tenant.id },
    });

    if (!order) throw new BadRequestException('Order not found');

    const result = await this.paymentService.createPayment(provider, {
      orderId: dto.orderId,
      amount: Number(order.total),
      tenantId: tenant.id,
      aliasYappy: dto.aliasYappy,
    });

    if (provider === 'cash') {
      await this.prisma.order.updateMany({
        where: { orderId: dto.orderId, tenantId: tenant.id },
        data: { orderStatus: OrderStatus.paid },
      });
    }

    if (provider === 'yappy' && this.configService.get<string>('YAPPY_MOCK') === 'true') {
      this.logger.log(`[MOCK] Simulating Yappy webhook — marking order ${dto.orderId} as paid`);
      await this.prisma.order.updateMany({
        where: { orderId: dto.orderId, tenantId: tenant.id },
        data: {
          orderStatus: OrderStatus.paid,
          ...(result.transactionId ? { transactionId: result.transactionId } : {}),
        },
      });
    }

    return { success: true, transactionId: result.transactionId, documentName: result.documentName };
  }
}
