import { ConflictException, Logger } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as crypto from 'crypto';
import { MemberService } from './member.service';

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

describe('MemberService invitations', () => {
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
    tenantMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    memberInvitation: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const config = {
    getOrThrow: vi.fn((key: string) => {
      if (key === 'TEAM_INVITE_URL') return 'multitenant://invite';
      throw new Error(`Missing config: ${key}`);
    }),
  };

  const resend = {
    sendMemberInvite: vi.fn(),
  };

  const notifications = { send: vi.fn().mockResolvedValue(undefined) };
  const service = new MemberService(prisma as any, config as any, resend as any, notifications as any);
  const tenant = { id: 'tenant-1', name: 'Demo Store' };

  beforeEach(() => {
    vi.clearAllMocks();
    resend.sendMemberInvite.mockResolvedValue(undefined);
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
    prisma.memberInvitation.updateMany.mockResolvedValue({ count: 1 });
    prisma.memberInvitation.create.mockImplementation(async (args: any) => ({
      id: 'invite-1',
      email: args.data.email,
      role: args.data.role,
      tenantId: args.data.tenantId,
      expiresAt: args.data.expiresAt,
      usedAt: null,
      createdAt: new Date(),
    }));
  });

  it('GIVEN a new invite WHEN inviting a member SHOULD store a hashed token and email the raw-token link', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ name: 'Owner', email: 'owner@example.com' });

    await service.invite(tenant, 'owner-1', {
      email: 'Member@Example.com',
      role: UserRole.manager,
    });

    expect(prisma.memberInvitation.updateMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', email: 'member@example.com', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });

    const createCall = prisma.memberInvitation.create.mock.calls[0][0];
    const inviteUrl = resend.sendMemberInvite.mock.calls[0][1];
    const tokenFromUrl = new URL(inviteUrl).searchParams.get('token');

    expect(tokenFromUrl).toBeTruthy();
    expect(createCall.data.tokenHash).toBe(hashToken(tokenFromUrl!));
    expect(createCall.data.tokenHash).not.toBe(tokenFromUrl);
    expect(createCall.data.email).toBe('member@example.com');
    expect(resend.sendMemberInvite).toHaveBeenCalledWith(
      'member@example.com',
      expect.stringContaining('multitenant://invite?token='),
      'Demo Store',
      UserRole.manager,
      'Owner',
    );
  });

  it('GIVEN an existing tenant member WHEN inviting SHOULD reject without creating an invitation', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', isActive: true });
    prisma.tenantMember.findUnique.mockResolvedValue({ id: 'member-1' });

    await expect(service.invite(tenant, 'owner-1', {
      email: 'member@example.com',
      role: UserRole.admin,
    })).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.memberInvitation.create).not.toHaveBeenCalled();
    expect(resend.sendMemberInvite).not.toHaveBeenCalled();
  });

  it('GIVEN an inactive platform user WHEN inviting SHOULD reject before sending email', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', isActive: false });

    await expect(service.invite(tenant, 'owner-1', {
      email: 'inactive@example.com',
      role: UserRole.manager,
    })).rejects.toMatchObject({
      response: { code: 'INVITED_USER_INACTIVE' },
    });

    expect(prisma.memberInvitation.create).not.toHaveBeenCalled();
    expect(resend.sendMemberInvite).not.toHaveBeenCalled();
  });

  it('GIVEN email delivery fails WHEN inviting SHOULD invalidate the invitation and return a controlled error', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ name: null, email: 'owner@example.com' });
    resend.sendMemberInvite.mockRejectedValue(new Error('Email delivery failed'));

    await expect(service.invite(tenant, 'owner-1', {
      email: 'member@example.com',
      role: UserRole.manager,
    })).rejects.toMatchObject({
      response: { code: 'MEMBER_INVITE_EMAIL_DELIVERY_FAILED' },
    });

    expect(prisma.memberInvitation.updateMany).toHaveBeenLastCalledWith({
      where: { id: 'invite-1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
  });

  it('GIVEN pending invites WHEN listing invitations SHOULD filter by tenant and active expiry', async () => {
    const createdAt = new Date('2026-05-20T12:00:00.000Z');
    const expiresAt = new Date('2026-05-27T12:00:00.000Z');
    prisma.memberInvitation.findMany.mockResolvedValue([
      {
        id: 'invite-1',
        email: 'pending@example.com',
        role: UserRole.manager,
        tenantId: 'tenant-1',
        expiresAt,
        usedAt: null,
        createdAt,
      },
    ]);

    const invitations = await service.findPendingInvitations('tenant-1');

    expect(prisma.memberInvitation.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        usedAt: null,
        expiresAt: { gt: expect.any(Date) },
      },
      select: {
        id: true,
        email: true,
        role: true,
        tenantId: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(invitations).toEqual([
      {
        documentId: 'invite-1',
        email: 'pending@example.com',
        role: UserRole.manager,
        tenantId: 'tenant-1',
        expiresAt: expiresAt.toISOString(),
        usedAt: null,
        createdAt: createdAt.toISOString(),
      },
    ]);
  });
});
