import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus } from '@prisma/client';
import { OrderRepository } from '../order/order.repository';
import { OrderStockService } from '../order/order-stock.service';
import { hashOrderViewToken } from '../order/order-view-token';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CashProvider } from './providers/cash.provider';
import { YappyProvider } from './providers/yappy.provider';
import type {
  CreatePaymentParams,
  CreatePaymentResult,
  IPaymentProvider,
} from './interfaces/payment-provider.interface';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly registry = new Map<string, IPaymentProvider>();

  constructor(
    private readonly yappyProvider: YappyProvider,
    private readonly cashProvider: CashProvider,
    private readonly orders: OrderRepository,
    private readonly configService: ConfigService,
    private readonly orderStockService: OrderStockService,
  ) {
    this.register(yappyProvider);
    this.register(cashProvider);
  }

  private register(provider: IPaymentProvider): void {
    this.registry.set(provider.name, provider);
  }

  getProvider(name: string): IPaymentProvider {
    const provider = this.registry.get(name);
    if (!provider)
      throw new BadRequestException(
        `Payment provider "${name}" is not supported`,
      );
    return provider;
  }

  async createPayment(
    providerName: string,
    params: CreatePaymentParams,
  ): Promise<CreatePaymentResult> {
    return this.getProvider(providerName).createPayment(params);
  }

  async createPaymentForOrder(
    provider: string,
    dto: CreatePaymentDto,
    tenantId: string,
  ) {
    const order = await this.orders.findByOrderIdAndViewTokenHash(
      dto.orderId,
      tenantId,
      hashOrderViewToken(dto.viewToken),
    );

    if (!order) throw new BadRequestException('Order not found');

    const result = await this.createPayment(provider, {
      orderId: dto.orderId,
      amount: Number(order.total),
      tenantId,
      aliasYappy: dto.aliasYappy,
    });

    if (provider === 'cash') {
      await this.orderStockService.transitionOrderStatusByOrderId(
        dto.orderId,
        tenantId,
        {
          orderStatus: OrderStatus.paid,
        },
      );
    }

    if (
      provider === 'yappy' &&
      this.configService.get<string>('YAPPY_MOCK') === 'true'
    ) {
      this.logger.log(
        `[MOCK] Simulating Yappy webhook - marking order ${dto.orderId} as paid`,
      );
      await this.orderStockService.transitionOrderStatusByOrderId(
        dto.orderId,
        tenantId,
        {
          orderStatus: OrderStatus.paid,
          ...(result.transactionId
            ? { transactionId: result.transactionId }
            : {}),
        },
      );
    }

    return {
      success: true,
      transactionId: result.transactionId,
      documentName: result.documentName,
      token: result.token,
    };
  }
}
