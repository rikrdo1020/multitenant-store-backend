import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { EmailDeliveryStatus } from '@prisma/client';
import { normalizeEmail } from '../../common/utils/privacy';

export const SEND_COUNT_STATUSES = [
  EmailDeliveryStatus.attempted,
  EmailDeliveryStatus.sent,
  EmailDeliveryStatus.failed,
];

export const RATE_COUNT_STATUSES = [
  EmailDeliveryStatus.attempted,
  EmailDeliveryStatus.sent,
  EmailDeliveryStatus.failed,
  EmailDeliveryStatus.skipped,
];

export interface EmailLimitConfig {
  recipientWindowMinutes: number;
  recipientWindowLimit: number;
  actorWindowMinutes: number;
  actorWindowLimit: number;
  tenantDailyLimit: number;
  globalHourlyLimit: number;
  globalDailyLimit: number;
}

export function readEmailLimitConfig(config: ConfigService): EmailLimitConfig {
  return {
    recipientWindowMinutes: config.get<number>('EMAIL_RECIPIENT_WINDOW_MINUTES') ?? 15,
    recipientWindowLimit: config.get<number>('EMAIL_RECIPIENT_WINDOW_LIMIT') ?? 3,
    actorWindowMinutes: config.get<number>('EMAIL_ACTOR_WINDOW_MINUTES') ?? 15,
    actorWindowLimit: config.get<number>('EMAIL_ACTOR_WINDOW_LIMIT') ?? 10,
    tenantDailyLimit: config.get<number>('EMAIL_TENANT_DAILY_LIMIT') ?? 200,
    globalHourlyLimit: config.get<number>('EMAIL_HOURLY_SEND_LIMIT') ?? 100,
    globalDailyLimit: config.get<number>('EMAIL_DAILY_SEND_LIMIT') ?? 500,
  };
}

export function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

export function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return normalizeEmail(message).replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[masked-email]');
}

export function emailRateLimitException(code: string): HttpException {
  return new HttpException({
    code,
    message: 'Too many email requests. Try again later.',
  }, HttpStatus.TOO_MANY_REQUESTS);
}
