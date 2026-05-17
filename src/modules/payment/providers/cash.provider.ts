import { Injectable } from '@nestjs/common';
import type {
  CreatePaymentParams,
  CreatePaymentResult,
  IPaymentProvider,
} from '../interfaces/payment-provider.interface';

@Injectable()
export class CashProvider implements IPaymentProvider {
  readonly name = 'cash';

  async createPayment(_params: CreatePaymentParams): Promise<CreatePaymentResult> {
    return {};
  }
}
