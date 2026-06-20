import { createHash } from 'crypto';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hashIdentifier(value: string): string {
  return createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

export function maskEmail(email: string): string {
  const normalized = normalizeEmail(email);
  const [localPart, domain] = normalized.split('@');

  if (!localPart || !domain) {
    return 'unknown-email';
  }

  const prefix = localPart.slice(0, Math.min(2, localPart.length));
  return `${prefix}${'*'.repeat(Math.max(3, localPart.length - prefix.length))}@${domain}`;
}

export function maskEmailList(recipients: string | string[]): string {
  const list = Array.isArray(recipients) ? recipients : [recipients];
  return list.map(maskEmail).join(', ');
}
