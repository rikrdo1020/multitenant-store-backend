import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

describe('AuthService password recovery', () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    passwordResetToken: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    refreshToken: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const jwt = {
    sign: vi.fn(),
    verify: vi.fn(),
  };

  const config = {
    get: vi.fn((key: string) => {
      if (key === 'PASSWORD_RESET_URL') return 'multitenant://reset-password';
      return undefined;
    }),
    getOrThrow: vi.fn((key: string) => {
      if (key === 'PASSWORD_RESET_URL') return 'multitenant://reset-password';
      throw new Error(`Missing config: ${key}`);
    }),
  };

  const resend = {
    sendPasswordReset: vi.fn(),
  };

  const service = new AuthService(prisma as any, jwt as any, config as any, resend as any);

  beforeEach(() => {
    vi.clearAllMocks();
    resend.sendPasswordReset.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(async (operationOrCallback: unknown) => {
      if (typeof operationOrCallback === 'function') {
        return operationOrCallback(prisma);
      }

      return Promise.all(operationOrCallback as Promise<unknown>[]);
    });
    prisma.user.update.mockReturnValue({ operation: 'user.update' });
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.refreshToken.deleteMany.mockReturnValue({ operation: 'refreshToken.deleteMany' });
  });

  it('GIVEN a registered email WHEN forgot password runs SHOULD store only a hashed reset token and email the raw token link', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'owner@example.com' });
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.passwordResetToken.create.mockResolvedValue({});

    await service.forgotPassword('owner@example.com');

    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 'user-1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });

    const createCall = prisma.passwordResetToken.create.mock.calls[0][0];
    const resetUrl = resend.sendPasswordReset.mock.calls[0][1];
    const tokenFromUrl = new URL(resetUrl).searchParams.get('token');

    expect(tokenFromUrl).toBeTruthy();
    expect(createCall.data.tokenHash).toBe(hashToken(tokenFromUrl!));
    expect(createCall.data.tokenHash).not.toBe(tokenFromUrl);
    expect(createCall.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(resend.sendPasswordReset).toHaveBeenCalledWith('owner@example.com', expect.stringContaining('multitenant://reset-password?token='));
  });

  it('GIVEN an unknown email WHEN forgot password runs SHOULD return the selected email-not-found error', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.forgotPassword('missing@example.com')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.forgotPassword('missing@example.com')).rejects.toMatchObject({
      response: { code: 'PASSWORD_RESET_EMAIL_NOT_FOUND' },
    });
    expect(prisma.passwordResetToken.create).not.toHaveBeenCalled();
    expect(resend.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('GIVEN email delivery fails WHEN forgot password runs SHOULD invalidate the reset token and return a controlled error', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'owner@example.com' });
    prisma.passwordResetToken.create.mockResolvedValue({});
    resend.sendPasswordReset.mockRejectedValue(new Error('Email delivery failed: API key is invalid'));

    await expect(service.forgotPassword('owner@example.com')).rejects.toMatchObject({
      response: { code: 'PASSWORD_RESET_EMAIL_DELIVERY_FAILED' },
    });

    const createdTokenHash = prisma.passwordResetToken.create.mock.calls[0][0].data.tokenHash;
    expect(prisma.passwordResetToken.updateMany).toHaveBeenLastCalledWith({
      where: { tokenHash: createdTokenHash, usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('GIVEN an expired token WHEN reset password runs SHOULD reject with an expired-token code', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.resetPassword('raw-token', 'newsecure123')).rejects.toMatchObject({
      response: { code: 'EXPIRED_RESET_TOKEN' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('GIVEN a missing token WHEN reset password runs SHOULD reject with an invalid-token code', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue(null);

    await expect(service.resetPassword('raw-token', 'newsecure123')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.resetPassword('raw-token', 'newsecure123')).rejects.toMatchObject({
      response: { code: 'INVALID_RESET_TOKEN' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('GIVEN a used token WHEN reset password runs SHOULD reject with an invalid-token code', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000 * 60),
    });

    await expect(service.resetPassword('raw-token', 'newsecure123')).rejects.toMatchObject({
      response: { code: 'INVALID_RESET_TOKEN' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('GIVEN a valid token WHEN reset password runs SHOULD update password, mark the token used, and revoke sessions', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 1000 * 60),
    });

    await service.resetPassword('raw-token', 'newsecure123');

    expect(prisma.passwordResetToken.updateMany).toHaveBeenCalledWith({
      where: { id: 'reset-1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { passwordHash: expect.any(String) },
    });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
  });

  it('GIVEN a token claimed by another request WHEN reset password runs SHOULD reject without updating the password', async () => {
    prisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'reset-1',
      userId: 'user-1',
      usedAt: null,
      expiresAt: new Date(Date.now() + 1000 * 60),
    });
    prisma.passwordResetToken.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.resetPassword('raw-token', 'newsecure123')).rejects.toMatchObject({
      response: { code: 'INVALID_RESET_TOKEN' },
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.refreshToken.deleteMany).not.toHaveBeenCalled();
  });
});
