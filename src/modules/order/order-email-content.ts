export interface SenderSettings {
  fromEmail?: string;
  fromName?: string;
}

export interface OrderEmailSummary {
  orderId: string;
  total: number;
  status?: string;
  customerName?: string;
  tenantName?: string;
  currency?: string;
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

  return `
    <p>${escapeHtml(input.intro)}</p>
    <p><strong>Orden:</strong> ${escapeHtml(summary.orderId)}</p>
    <p><strong>Total:</strong> ${escapeHtml(currency)} ${summary.total.toFixed(2)}</p>
    ${statusLine}
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
    [OrderStatus.cancelled]: 'cancelado',
    [OrderStatus.failed]: 'fallido',
    [OrderStatus.rejected]: 'rechazado',
    [OrderStatus.expired]: 'expirado',
  };
  return labels[status];
}
import { OrderStatus } from '@prisma/client';
