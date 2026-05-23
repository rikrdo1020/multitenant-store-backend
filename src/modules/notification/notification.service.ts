import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';
import { NotificationRepository, CreateNotificationInput } from './notification.repository';
import { NotificationPlatform } from '@prisma/client';
import { RegisterTokenDto } from './dto/register-token.dto';
import { serialize, serializeList } from '../../common/utils/serializer';

@Injectable()
export class NotificationService {
  private readonly expo = new Expo();
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly repo: NotificationRepository) {}

  async registerToken(userId: string, dto: RegisterTokenDto) {
    const token = await this.repo.upsertPushToken(userId, dto.token, dto.platform as NotificationPlatform);
    return serialize(token);
  }

  async findAll(userId: string) {
    const notifications = await this.repo.findByUserId(userId);
    return serializeList(notifications, { page: 1, pageSize: 50, total: notifications.length });
  }

  async markAsRead(id: string, userId: string) {
    const exists = await this.repo.findByIdAndUserId(id, userId);
    if (!exists) throw new NotFoundException({ code: 'NOTIFICATION_NOT_FOUND', message: 'Notification not found' });

    await this.repo.markAsRead(id, userId);
    return { success: true };
  }

  async send(input: CreateNotificationInput): Promise<void> {
    const notification = await this.repo.createNotification(input);

    const tokens = await this.repo.findTokensByUserId(input.userId);
    if (!tokens.length) return;

    const validTokens = tokens.filter((t) => Expo.isExpoPushToken(t.token));
    if (!validTokens.length) return;

    const messages: ExpoPushMessage[] = validTokens.map((t) => ({
      to: t.token,
      title: input.title,
      body: input.body,
      data: { notificationId: notification.id, type: input.type, ...(input.metadata ?? {}) },
    }));

    const chunks = this.expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      try {
        await this.expo.sendPushNotificationsAsync(chunk);
      } catch (err) {
        this.logger.error('Push notification delivery failed', err instanceof Error ? err.stack : undefined);
      }
    }
  }
}
