import { createHash, randomBytes } from 'crypto';

export function generateOrderViewToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashOrderViewToken(token: string): string {
  return createHash('sha256').update(token.trim()).digest('hex');
}
