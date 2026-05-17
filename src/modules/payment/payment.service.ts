import { BadRequestException, Injectable } from '@nestjs/common';
import { CashProvider } from './providers/cash.provider';
import { YappyProvider } from './providers/yappy.provider';
import type {
  CreatePaymentParams,
  CreatePaymentResult,
  IPaymentProvider,
} from './interfaces/payment-provider.interface';

@Injectable()
export class PaymentService {
  private readonly registry = new Map<string, IPaymentProvider>();

  constructor(
    private readonly yappyProvider: YappyProvider,
    private readonly cashProvider: CashProvider,
  ) {
    this.register(yappyProvider);
    this.register(cashProvider);
  }

  private register(provider: IPaymentProvider): void {
    this.registry.set(provider.name, provider);
  }

  getProvider(name: string): IPaymentProvider {
    const provider = this.registry.get(name);
    if (!provider) throw new BadRequestException(`Payment provider "${name}" is not supported`);
    return provider;
  }

  async createPayment(providerName: string, params: CreatePaymentParams): Promise<CreatePaymentResult> {
    return this.getProvider(providerName).createPayment(params);
  }
}
