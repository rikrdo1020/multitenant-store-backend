import { NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationService } from './notification.service';

vi.mock('expo-server-sdk', () => {
  const isExpoPushToken = (token: string) => token.startsWith('ExponentPushToken[');
  const chunkPushNotifications = (msgs: unknown[]) => [msgs];
  const sendPushNotificationsAsync = vi.fn().mockResolvedValue([]);
  const Expo = vi.fn().mockImplementation(() => ({
    chunkPushNotifications,
    sendPushNotificationsAsync,
  }));
  (Expo as any).isExpoPushToken = isExpoPushToken;
  return { Expo };
});

const makeRepo = () => ({
  upsertPushToken: vi.fn(),
  findTokensByUserId: vi.fn(),
  createNotification: vi.fn(),
  findByUserId: vi.fn(),
  findByIdAndUserId: vi.fn(),
  markAsRead: vi.fn(),
  countUnread: vi.fn(),
});

describe('NotificationService', () => {
  let repo: ReturnType<typeof makeRepo>;
  let service: NotificationService;

  beforeEach(() => {
    repo = makeRepo();
    service = new NotificationService(repo as any);
  });

  describe('registerToken', () => {
    it('upserts token and returns serialized result', async () => {
      const token = { id: 't1', userId: 'u1', token: 'tok', platform: 'ios', createdAt: new Date() };
      repo.upsertPushToken.mockResolvedValue(token);

      const result = await service.registerToken('u1', { token: 'tok', platform: 'ios' as any });

      expect(repo.upsertPushToken).toHaveBeenCalledWith('u1', 'tok', 'ios');
      expect(result).toMatchObject({ documentId: 't1' });
    });
  });

  describe('findAll', () => {
    it('returns paginated list of notifications', async () => {
      const notifications = [
        { id: 'n1', userId: 'u1', title: 'T', body: 'B', type: NotificationType.order_created, read: false, metadata: null, createdAt: new Date() },
      ];
      repo.findByUserId.mockResolvedValue(notifications);

      const result = await service.findAll('u1');

      expect(repo.findByUserId).toHaveBeenCalledWith('u1');
      expect(result.items).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });
  });

  describe('markAsRead', () => {
    it('marks notification as read when it belongs to user', async () => {
      const notification = { id: 'n1', userId: 'u1', read: false };
      repo.findByIdAndUserId.mockResolvedValue(notification);
      repo.markAsRead.mockResolvedValue({ count: 1 });

      const result = await service.markAsRead('n1', 'u1');

      expect(repo.markAsRead).toHaveBeenCalledWith('n1', 'u1');
      expect(result).toEqual({ success: true });
    });

    it('throws NotFoundException when notification not found or belongs to different user', async () => {
      repo.findByIdAndUserId.mockResolvedValue(null);

      await expect(service.markAsRead('n1', 'u1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('send', () => {
    it('creates notification record and sends push to valid tokens', async () => {
      const notification = { id: 'n1', userId: 'u1', type: NotificationType.order_created };
      repo.createNotification.mockResolvedValue(notification);
      repo.findTokensByUserId.mockResolvedValue([
        { token: 'ExponentPushToken[valid-token]' },
      ]);

      await service.send({ userId: 'u1', title: 'T', body: 'B', type: NotificationType.order_created });

      expect(repo.createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', title: 'T', body: 'B' }),
      );
    });

    it('skips push send when user has no tokens', async () => {
      const notification = { id: 'n1', userId: 'u1' };
      repo.createNotification.mockResolvedValue(notification);
      repo.findTokensByUserId.mockResolvedValue([]);

      await service.send({ userId: 'u1', title: 'T', body: 'B', type: NotificationType.order_created });

      expect(repo.createNotification).toHaveBeenCalled();
    });

    it('skips invalid Expo tokens', async () => {
      const notification = { id: 'n1', userId: 'u1' };
      repo.createNotification.mockResolvedValue(notification);
      repo.findTokensByUserId.mockResolvedValue([{ token: 'invalid-token-format' }]);

      await service.send({ userId: 'u1', title: 'T', body: 'B', type: NotificationType.order_created });

      expect(repo.createNotification).toHaveBeenCalled();
    });
  });
});
