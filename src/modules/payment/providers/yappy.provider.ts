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
    this.logger.log(`createPayment called — orderId: ${params.orderId}, amount: ${params.amount}, aliasYappy: ${params.aliasYappy ?? 'N/A'}`);

    if (this.isMock()) {
      this.logger.log(`[MOCK] Yappy payment for order ${params.orderId}`);
      return {
        transactionId: `MOCK-TXN-${Date.now()}`,
        documentName: `MOCK-DOC-${params.orderId}`,
      };
    }

    const config = this.buildConfig();
    this.logger.log(`Config built — merchantId: ${config.merchantId}, urlDomain: ${config.urlDomain}, apiUrl: ${config.apiUrl}`);

    this.logger.log(`Validating Yappy merchant...`);
    let merchantResult: Awaited<ReturnType<typeof validateYappyMerchant>>;
    try {
      merchantResult = await validateYappyMerchant(config);
    } catch (err) {
      this.logger.error(`validateYappyMerchant threw an exception`, err instanceof Error ? err.stack : String(err));
      throw err;
    }

    this.logger.log(`Merchant validation response — success: ${merchantResult.success}, hasToken: ${!!merchantResult.token}`);
    if (!merchantResult.success || !merchantResult.token) {
      this.logger.error(`Merchant validation failed — full response: ${JSON.stringify(merchantResult)}`);
      throw new BadRequestException('Yappy merchant validation failed');
    }

    const paymentPayload = {
      token: merchantResult.token,
      orderId: params.orderId.replace('ORD-', ''),
      aliasYappy: (params.aliasYappy ?? '').replace(/-/g, ''),
      total: params.amount,
    };
    this.logger.log(`Creating Yappy payment — payload: ${JSON.stringify(paymentPayload)}`);

    let result: Awaited<ReturnType<typeof createYappyPayment>>;
    try {
      result = await createYappyPayment(config, paymentPayload);
    } catch (err) {
      this.logger.error(`createYappyPayment threw an exception`, err instanceof Error ? err.stack : String(err));
      throw err;
    }

    this.logger.log(`createYappyPayment response — success: ${result.success}, raw: ${JSON.stringify(result)}`);
    if (!result.success) {
      this.logger.error(`Payment creation failed — message: ${result.message}`);
      throw new BadRequestException(result.message ?? 'Yappy payment creation failed');
    }

    this.logger.log(`Yappy payment created — order: ${params.orderId}, txn: ${result.transactionId}`);

    return {
      transactionId: result.transactionId,
      documentName: result.documentName,
      token: result.token,
    };
  }
}
