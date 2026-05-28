import { Injectable } from '@nestjs/common';
import { EmailAction, EmailDeliveryStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class EmailDeliveryRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByDedupeHash(dedupeKeyHash: string) {
    return this.prisma.emailDelivery.findUnique({
      where: { dedupeKeyHash },
      select: { id: true, status: true },
    });
  }

  count(where: Prisma.EmailDeliveryWhereInput): Promise<number> {
    return this.prisma.emailDelivery.count({ where });
  }

  createAttempt(data: {
    action: EmailAction;
    recipientHash: string;
    actorHash?: string;
    tenantId?: string;
    dedupeKeyHash?: string;
  }): Promise<{ id: string }> {
    return this.prisma.emailDelivery.create({
      data: {
        ...data,
        status: EmailDeliveryStatus.attempted,
      },
      select: { id: true },
    });
  }

  createSkipped(data: {
    action: EmailAction;
    recipientHash: string;
    actorHash?: string;
    tenantId?: string;
    reason: string;
  }): Promise<unknown> {
    return this.prisma.emailDelivery.create({
      data: { ...data, status: EmailDeliveryStatus.skipped },
    });
  }

  createBlocked(data: {
    action: EmailAction;
    recipientHash: string;
    actorHash?: string;
    tenantId?: string;
    reason: string;
  }): Promise<unknown> {
    return this.prisma.emailDelivery.create({
      data: { ...data, status: EmailDeliveryStatus.blocked },
    });
  }

  markSent(id: string): Promise<unknown> {
    return this.prisma.emailDelivery.update({
      where: { id },
      data: { status: EmailDeliveryStatus.sent, errorMessage: null },
    });
  }

  markFailed(id: string, errorMessage: string): Promise<unknown> {
    return this.prisma.emailDelivery.update({
      where: { id },
      data: { status: EmailDeliveryStatus.failed, errorMessage },
    });
  }
}
