# Backend Payment Gateway

## Architecture

Payment processing is **provider-agnostic**. Each tenant configures one provider via `Tenant.provider` and `Tenant.providerConfig`.

```
PaymentService
  ├── StripeProvider
  ├── YappyProvider
  ├── PayPalProvider
  └── MercadoPagoProvider
```

All providers implement `PaymentProviderInterface`:

```ts
interface PaymentProviderInterface {
  name: string;
  initialize(config: Record<string, string>): void;
  createPayment(order: Order, customer: CustomerData): Promise<PaymentIntent>;
  verifyWebhook(payload: unknown, signature: string): Promise<boolean>;
  parseWebhook(payload: unknown): WebhookResult;
  refund(paymentId: string, amount?: number): Promise<boolean>;
}
```

## Supported Providers

| Provider | Status | Notes |
|----------|--------|-------|
| Stripe | Primary | Recommended default. Cards, wallets, links. |
| Yappy | Planned | Panama-specific (Banco General). |
| PayPal | Planned | International |
| MercadoPago | Planned | LATAM |

## Stripe Flow (Default)

### Create Payment
```
1. Frontend POST /orders
   Body: { items, customerData, shippingData, shippingMethodId }

2. Backend:
   a. Validate stock for each item (tenant-scoped)
   b. Fetch active combos, run calculateCartPricing
   c. Compute shippingCost
   d. Create Order record (status: pending)
   e. Call StripeProvider.createPayment(order, customerData)
      → Create Stripe PaymentIntent
      → Save paymentIntentId in Order.transactionId
   f. Return { order, clientSecret }

3. Frontend:
   → Uses Stripe SDK to confirm payment (mobile/web)
   → On success: redirect to success screen
```

### Webhook
```
POST /webhooks/stripe
→ StripeProvider.verifyWebhook() validates signature
→ Parse event type:
   payment_intent.succeeded → updatePaymentStatus(orderId, paid)
   payment_intent.payment_failed → updatePaymentStatus(orderId, failed)
→ Send confirmation emails
→ Return 200 to Stripe
```

## Yappy Flow (When Implemented)

```
1. Frontend POST /orders → Backend creates order, calls Yappy API
2. Backend returns { transactionId, token } to frontend
3. Frontend opens Yappy deep link or in-app browser
4. User completes payment in Yappy app
5. Yappy sends GET /webhooks/yappy
6. Backend validates HMAC, updates order status
```

## Mock Mode

For development when payment providers are unavailable:

```env
PAYMENT_MOCK=true
```

Behavior:
- All provider API calls return fake success responses
- Webhooks are auto-triggered internally after 2 seconds with status `paid`
- Orders are created normally in DB
- **Never enable in production**

## Webhook Security

- Stripe: validate signature using webhook secret
- Yappy: validate HMAC-SHA256 hash
- All webhooks: verify order exists and belongs to the tenant
- Return 200 quickly, do heavy work asynchronously

## Order Status Mapping

| Provider Status | OrderStatus |
|-----------------|-------------|
| succeeded / paid | `paid` |
| failed / rejected | `failed` |
| cancelled | `cancelled` |
| expired | `expired` |

## Email Notifications

Triggered on status change to `paid`:
- **Customer**: order confirmation (item list, totals, shipping)
- **Admins**: notification to all tenant members with `notifyOnOrder=true`

Uses Resend. Errors are logged but do not fail the payment flow.

## Refunds

Admin can initiate refunds via `POST /admin/orders/:id/refund`.
- Partial refund supported
- Provider-dependent implementation
