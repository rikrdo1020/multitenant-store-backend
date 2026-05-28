import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationPlatform, NotificationType, Prisma } from '@prisma/client';

export interface CreateNotificationInput {
  userId: string;
  title: string;
  body: string;
  type: NotificationType;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  upsertPushToken(userId: string, token: string, platform: NotificationPlatform) {
    return this.prisma.pushToken.upsert({
      where: { userId_token: { userId, token } },
      create: { userId, token, platform },
      update: { platform },
    });
  }

  findTokensByUserId(userId: string) {
    return this.prisma.pushToken.findMany({ where: { userId } });
  }

  createNotification(data: CreateNotificationInput) {
    return this.prisma.notification.create({
      data: {
        userId: data.userId,
        title: data.title,
        body: data.body,
        type: data.type,
        metadata: data.metadata as Prisma.InputJsonValue ?? Prisma.DbNull,
      },
    });
  }

  findByUserId(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  findByIdAndUserId(id: string, userId: string) {
    return this.prisma.notification.findFirst({ where: { id, userId } });
  }

  markAsRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }

  countUnread(userId: string) {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }
}
