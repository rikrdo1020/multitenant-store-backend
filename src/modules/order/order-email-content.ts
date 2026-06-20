import { OrderStatus } from '@prisma/client';

export interface SenderSettings {
  fromEmail?: string;
  fromName?: string;
}

export interface OrderEmailItemSummary {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface OrderEmailPricingSummary {
  subtotal: number;
  discount: number;
  shippingCost: number;
  tax: number;
  total: number;
}

export interface OrderEmailSummary {
  orderId: string;
  total: number;
  status?: string;
  customerName?: string;
  tenantName?: string;
  currency?: string;
  trackingUrl?: string;
  trackingNumber?: string;
  trackingCarrier?: string;
  items: OrderEmailItemSummary[];
  pricing: OrderEmailPricingSummary;
}

export function buildOrderEmailHtml(input: {
  intro: string;
  actionText: string;
  summary: OrderEmailSummary;
}): string {
  const summary = input.summary;
  const currency = summary.currency ?? 'USD';
  const statusLine = summary.status
    ? `<p><strong>Estado:</strong> ${escapeHtml(summary.status)}</p>`
    : '';
  const trackingLink = summary.trackingUrl
    ? `<p><a href="${escapeHtml(summary.trackingUrl)}">Ver seguimiento de la orden</a></p>`
    : '';
  const carrierLine = summary.trackingNumber
    ? `<p><strong>Tracking:</strong> ${escapeHtml(summary.trackingCarrier ?? 'Carrier')} ${escapeHtml(summary.trackingNumber)}</p>`
    : '';

  return `
    <p>${escapeHtml(input.intro)}</p>
    <p><strong>Orden:</strong> ${escapeHtml(summary.orderId)}</p>
    ${statusLine}
    ${buildItemsHtml(summary.items, currency)}
    ${buildPricingHtml(summary.pricing, currency)}
    ${carrierLine}
    ${trackingLink}
    <p>${escapeHtml(input.actionText)}</p>
  `;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function orderStatusLabel(status: OrderStatus): string {
  const labels: Record<OrderStatus, string> = {
    [OrderStatus.pending]: 'pendiente',
    [OrderStatus.paid]: 'pagado',
    [OrderStatus.processing]: 'en preparacion',
    [OrderStatus.ready]: 'preparado',
    [OrderStatus.shipped]: 'enviado',
    [OrderStatus.delivered]: 'entregado',
    [OrderStatus.cancelled]: 'cancelado',
    [OrderStatus.failed]: 'fallido',
    [OrderStatus.rejected]: 'rechazado',
    [OrderStatus.expired]: 'expirado',
  };
  return labels[status];
}

function buildItemsHtml(items: OrderEmailItemSummary[], currency: string): string {
  if (!items.length) return '';

  const rows = items
    .map(
      (item) => `
        <li>
          ${escapeHtml(item.name)} x ${item.quantity}
          - ${escapeHtml(currency)} ${(item.unitPrice * item.quantity).toFixed(2)}
        </li>
      `,
    )
    .join('');

  return `<p><strong>Productos:</strong></p><ul>${rows}</ul>`;
}

function buildPricingHtml(
  pricing: OrderEmailPricingSummary,
  currency: string,
): string {
  return `
    <p><strong>Subtotal:</strong> ${escapeHtml(currency)} ${pricing.subtotal.toFixed(2)}</p>
    <p><strong>Descuento:</strong> ${escapeHtml(currency)} ${pricing.discount.toFixed(2)}</p>
    <p><strong>Envio:</strong> ${escapeHtml(currency)} ${pricing.shippingCost.toFixed(2)}</p>
    <p><strong>Impuesto:</strong> ${escapeHtml(currency)} ${pricing.tax.toFixed(2)}</p>
    <p><strong>Total:</strong> ${escapeHtml(currency)} ${pricing.total.toFixed(2)}</p>
  `;
}
