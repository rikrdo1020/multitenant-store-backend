import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createYappyPayment,
  validateYappyMerchant,
  type YappyConfig,
} from '@rikrdo1020/yappy-button/server';
import type {
  CreatePaymentParams,
  CreatePaymentResult,
  IPaymentProvider,
} from '../interfaces/payment-provider.interface';

@Injectable()
export class YappyProvider implements IPaymentProvider {
  readonly name = 'yappy';
  private readonly logger = new Logger(YappyProvider.name);

  constructor(private readonly configService: ConfigService) {}

  isMock(): boolean {
    return this.configService.get<string>('YAPPY_MOCK') === 'true';
  }

  private buildConfig(): YappyConfig {
    return {
      merchantId: this.configService.getOrThrow<string>('YAPPY_MERCHANT_ID'),
      urlDomain: this.configService.getOrThrow<string>('YAPPY_URL_DOMAIN'),
      secretKey: this.configService.getOrThrow<string>('YAPPY_SECRET_KEY'),
      apiUrl: this.configService.get<string>('YAPPY_API_URL', 'https://api.multired.com.pa'),
      siteUrl: this.configService.getOrThrow<string>('YAPPY_SITE_URL'),
    };
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    if (this.isMock()) {
      this.logger.log(`[MOCK] Yappy payment for order ${params.orderId}`);
      return {
        transactionId: `MOCK-TXN-${Date.now()}`,
        documentName: `MOCK-DOC-${params.orderId}`,
      };
    }

    const config = this.buildConfig();

    const merchantResult = await validateYappyMerchant(config);
    if (!merchantResult.success || !merchantResult.token) {
      throw new BadRequestException('Yappy merchant validation failed');
    }

    const result = await createYappyPayment(config, {
      token: merchantResult.token,
      orderId: params.orderId,
      aliasYappy: params.aliasYappy ?? '',
      total: params.amount,
    });

    if (!result.success) {
      throw new BadRequestException(result.message ?? 'Yappy payment creation failed');
    }

    this.logger.log(`Yappy payment created — order: ${params.orderId}, txn: ${result.transactionId}`);

    return {
      transactionId: result.transactionId,
      documentName: result.documentName,
    };
  }
}
