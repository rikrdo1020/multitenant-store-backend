export interface CreatePaymentParams {
  orderId: string;
  amount: number;
  tenantId: string;
  aliasYappy?: string;
}

export interface CreatePaymentResult {
  transactionId?: string;
  documentName?: string;
}

export interface IPaymentProvider {
  readonly name: string;
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
}
