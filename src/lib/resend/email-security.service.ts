import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmailAction } from '@prisma/client';
import { hashIdentifier } from '../../common/utils/privacy';
import { EmailDeliveryRepository } from './email-delivery.repository';
import {
  EmailDeliveryAttempt,
  EmailDeliveryReservation,
} from './email-security.types';
import {
  daysAgo,
  emailRateLimitException,
  minutesAgo,
  RATE_COUNT_STATUSES,
  readEmailLimitConfig,
  safeErrorMessage,
  SEND_COUNT_STATUSES,
} from './email-security-limits';

@Injectable()
export class EmailSecurityService {
  constructor(
    private readonly emailDeliveries: EmailDeliveryRepository,
    private readonly config: ConfigService,
  ) {}

  async reserveDelivery(
    reservation: EmailDeliveryReservation,
  ): Promise<EmailDeliveryAttempt> {
    const recipientHash = hashIdentifier(reservation.recipient);
    const actorHash = reservation.actorKey
      ? hashIdentifier(reservation.actorKey)
      : undefined;
    const dedupeKeyHash = reservation.dedupeKey
      ? hashIdentifier(`${reservation.action}:${reservation.dedupeKey}`)
      : undefined;

    if (dedupeKeyHash) {
      const existing = await this.emailDeliveries.findByDedupeHash(dedupeKeyHash);

      if (existing) {
        await this.recordSkipped(reservation, 'EMAIL_DEDUPED');
        return { skipped: true, reason: 'EMAIL_DEDUPED' };
      }
    }

    await this.assertRecipientLimit(reservation.action, recipientHash);
    if (actorHash) {
      await this.assertActorLimit(reservation.action, actorHash);
    }
    if (reservation.tenantId) {
      await this.assertTenantLimit(reservation.action, reservation.tenantId);
    }
    await this.assertGlobalBudget(reservation.action, recipientHash);

    const delivery = await this.emailDeliveries.createAttempt({
      action: reservation.action,
      recipientHash,
      actorHash,
      tenantId: reservation.tenantId,
      dedupeKeyHash,
    });

    return { id: delivery.id, skipped: false };
  }

  async recordActionAttempt(
    reservation: EmailDeliveryReservation,
    reason: string,
  ): Promise<void> {
    const recipientHash = hashIdentifier(reservation.recipient);
    const actorHash = reservation.actorKey
      ? hashIdentifier(reservation.actorKey)
      : undefined;

    await this.assertRecipientLimit(reservation.action, recipientHash);
    if (actorHash) {
      await this.assertActorLimit(reservation.action, actorHash);
    }
    if (reservation.tenantId) {
      await this.assertTenantLimit(reservation.action, reservation.tenantId);
    }

    await this.emailDeliveries.createSkipped({
      action: reservation.action,
      recipientHash,
      actorHash,
      tenantId: reservation.tenantId,
      reason,
    });
  }

  async markSent(id?: string): Promise<void> {
    if (!id) return;
    await this.emailDeliveries.markSent(id);
  }

  async markFailed(id: string | undefined, error: unknown): Promise<void> {
    if (!id) return;
    await this.emailDeliveries.markFailed(id, safeErrorMessage(error));
  }

  private async assertRecipientLimit(
    action: EmailAction,
    recipientHash: string,
  ): Promise<void> {
    const count = await this.emailDeliveries.count({
        action,
        recipientHash,
        status: { in: RATE_COUNT_STATUSES },
        createdAt: { gte: minutesAgo(this.limits.recipientWindowMinutes) },
    });

    if (count >= this.limits.recipientWindowLimit) {
      await this.recordBlocked(action, recipientHash, 'EMAIL_RECIPIENT_RATE_LIMITED');
      throw emailRateLimitException('EMAIL_RECIPIENT_RATE_LIMITED');
    }
  }

  private async assertActorLimit(
    action: EmailAction,
    actorHash: string,
  ): Promise<void> {
    const count = await this.emailDeliveries.count({
        action,
        actorHash,
        status: { in: RATE_COUNT_STATUSES },
        createdAt: { gte: minutesAgo(this.limits.actorWindowMinutes) },
    });

    if (count >= this.limits.actorWindowLimit) {
      await this.recordBlocked(action, actorHash, 'EMAIL_ACTOR_RATE_LIMITED', {
        actorHash,
      });
      throw emailRateLimitException('EMAIL_ACTOR_RATE_LIMITED');
    }
  }

  private async assertTenantLimit(
    action: EmailAction,
    tenantId: string,
  ): Promise<void> {
    const count = await this.emailDeliveries.count({
        action,
        tenantId,
        status: { in: RATE_COUNT_STATUSES },
        createdAt: { gte: daysAgo(1) },
    });

    if (count >= this.limits.tenantDailyLimit) {
      await this.recordBlocked(action, hashIdentifier(tenantId), 'EMAIL_TENANT_DAILY_LIMITED', {
        tenantId,
      });
      throw emailRateLimitException('EMAIL_TENANT_DAILY_LIMITED');
    }
  }

  private async assertGlobalBudget(
    action: EmailAction,
    recipientHash: string,
  ): Promise<void> {
    const [hourlyCount, dailyCount] = await Promise.all([
      this.countGlobalSince(minutesAgo(60)),
      this.countGlobalSince(daysAgo(1)),
    ]);

    if (hourlyCount >= this.limits.globalHourlyLimit) {
      await this.recordBlocked(action, recipientHash, 'EMAIL_GLOBAL_HOURLY_LIMITED');
      throw emailRateLimitException('EMAIL_GLOBAL_HOURLY_LIMITED');
    }

    if (dailyCount >= this.limits.globalDailyLimit) {
      await this.recordBlocked(action, recipientHash, 'EMAIL_GLOBAL_DAILY_LIMITED');
      throw emailRateLimitException('EMAIL_GLOBAL_DAILY_LIMITED');
    }
  }

  private countGlobalSince(createdAt: Date): Promise<number> {
    return this.emailDeliveries.count({
        status: { in: SEND_COUNT_STATUSES },
        createdAt: { gte: createdAt },
    });
  }

  private async recordSkipped(
    reservation: EmailDeliveryReservation,
    reason: string,
  ): Promise<void> {
    await this.emailDeliveries.createSkipped({
      action: reservation.action,
      recipientHash: hashIdentifier(reservation.recipient),
      actorHash: reservation.actorKey
        ? hashIdentifier(reservation.actorKey)
        : undefined,
      tenantId: reservation.tenantId,
      reason,
    });
  }

  private async recordBlocked(
    action: EmailAction,
    recipientKey: string,
    reason: string,
    extra: { actorHash?: string; tenantId?: string } = {},
  ): Promise<void> {
    await this.emailDeliveries.createBlocked({
      action,
      recipientHash: recipientKey,
      actorHash: extra.actorHash,
      tenantId: extra.tenantId,
      reason,
    });
  }

  private get limits() {
    return readEmailLimitConfig(this.config);
  }
}
