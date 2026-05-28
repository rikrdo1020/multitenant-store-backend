import { BadRequestException, ConflictException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as crypto from 'crypto';
import { AuthService } from './auth.service';

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

describe('AuthService invitation registration', () => {
  const invitation = {
    id: 'invite-1',
    email: 'member@example.com',
    role: UserRole.manager,
    tenantId: 'tenant-1',
    usedAt: null,
    expiresAt: new Date(Date.now() + 1000 * 60),
    tenant: {
      id: 'tenant-1',
      slug: 'demo-store',
      name: 'Demo Store',
      logo: null,
      description: null,
      primaryColor: '#000000',
    },
  };

  const prisma = {
    memberInvitation: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    tenantMember: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    passwordResetToken: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };

  const jwt = {
    sign: vi.fn(),
    verify: vi.fn(),
  };

  const config = {
    get: vi.fn(),
    getOrThrow: vi.fn(),
  };

  const resend = {
    sendPasswordReset: vi.fn(),
  };

  const emailSecurity = {
    recordActionAttempt: vi.fn(),
  };

  const service = new AuthService(
    prisma as any,
    jwt as any,
    config as any,
    resend as any,
    emailSecurity as any,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.memberInvitation.findUnique.mockResolvedValue(invitation);
    prisma.memberInvitation.updateMany.mockResolvedValue({ count: 1 });
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'user-1',
      email: 'member@example.com',
      name: 'Invited Member',
      isActive: true,
    });
    prisma.tenantMember.findUnique.mockResolvedValue(null);
    prisma.tenantMember.create.mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma));
  });

  it('GIVEN a valid token WHEN verifying invite SHOULD return safe tenant and invite metadata', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'existing-user' });

    const result = await service.verifyInvite('raw-token');

    expect(prisma.memberInvitation.findUnique).toHaveBeenCalledWith({
      where: { tokenHash: hashToken('raw-token') },
      include: { tenant: { select: expect.any(Object) } },
    });
    expect(result).toMatchObject({
      email: 'member@example.com',
      role: UserRole.manager,
      isExistingUser: true,
      tenant: {
        documentId: 'tenant-1',
        slug: 'demo-store',
        name: 'Demo Store',
      },
    });
  });

  it('GIVEN an expired invite WHEN verifying SHOULD reject with expired code', async () => {
    prisma.memberInvitation.findUnique.mockResolvedValue({
      ...invitation,
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(service.verifyInvite('raw-token')).rejects.toMatchObject({
      response: { code: 'EXPIRED_INVITE_TOKEN' },
    });
  });

  it('GIVEN a new invited email WHEN registering by invite SHOULD create user, tenant member, and mark invite used', async () => {
    await service.registerInvite({
      token: 'raw-token',
      name: 'Invited Member',
      password: 'newsecure123',
    });

    expect(prisma.memberInvitation.updateMany).toHaveBeenCalledWith({
      where: { id: 'invite-1', usedAt: null },
      data: { usedAt: expect.any(Date) },
    });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'member@example.com',
        name: 'Invited Member',
        passwordHash: expect.any(String),
      },
      select: { id: true, email: true, name: true, isActive: true },
    });
    expect(prisma.tenantMember.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        tenantId: 'tenant-1',
        role: UserRole.manager,
      },
    });
  });

  it('GIVEN missing registration details for a new user WHEN registering SHOULD reject before claiming invite', async () => {
    await expect(service.registerInvite({ token: 'raw-token' })).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.memberInvitation.updateMany).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('GIVEN invite already claimed by another request WHEN registering SHOULD reject without creating member', async () => {
    prisma.memberInvitation.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.registerInvite({
      token: 'raw-token',
      name: 'Invited Member',
      password: 'newsecure123',
    })).rejects.toMatchObject({
      response: { code: 'INVALID_INVITE_TOKEN' },
    });
    expect(prisma.tenantMember.create).not.toHaveBeenCalled();
  });

  it('GIVEN user is already a tenant member WHEN registering SHOULD reject member creation', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'user-1', email: 'member@example.com', name: 'Member', isActive: true });
    prisma.tenantMember.findUnique.mockResolvedValue({ id: 'member-1' });

    await expect(service.registerInvite({
      token: 'raw-token',
    })).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.tenantMember.create).not.toHaveBeenCalled();
  });
});
