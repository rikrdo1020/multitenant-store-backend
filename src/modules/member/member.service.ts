import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { ResendService } from '../../lib/resend/resend.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UserRole } from '@prisma/client';
import { serialize } from '../../common/utils/serializer';
import * as crypto from 'crypto';

const MEMBER_INVITE_TOKEN_BYTES = 32;
const MEMBER_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class MemberService {
  private readonly logger = new Logger(MemberService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly resend: ResendService,
  ) {}

  async findAll(tenantId: string) {
    const members = await this.prisma.tenantMember.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, email: true, name: true, isActive: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return members.map(serialize);
  }

  async findPendingInvitations(tenantId: string) {
    const invitations = await this.prisma.memberInvitation.findMany({
      where: {
        tenantId,
        usedAt: null,
        expiresAt: { gt: new Date() },
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

    return invitations.map(serialize);
  }

  async invite(
    tenant: { id: string; name: string },
    invitedByUserId: string,
    dto: InviteMemberDto,
  ) {
    const email = dto.email.trim().toLowerCase();
    const role = dto.role ?? UserRole.manager;

    const existingUser = await this.prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      if (!existingUser.isActive) {
        throw new BadRequestException({
          code: 'INVITED_USER_INACTIVE',
          message: 'Invited user account is inactive',
        });
      }

      const existingMember = await this.prisma.tenantMember.findUnique({
        where: { userId_tenantId: { userId: existingUser.id, tenantId: tenant.id } },
      });
      if (existingMember) {
        throw new ConflictException({ code: 'MEMBER_EXISTS', message: 'User is already a member of this tenant' });
      }
    }

    const rawToken = crypto.randomBytes(MEMBER_INVITE_TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + MEMBER_INVITE_TTL_MS);
    const invitedBy = await this.prisma.user.findUnique({
      where: { id: invitedByUserId },
      select: { name: true, email: true },
    });

    const invitation = await this.prisma.$transaction(async (tx) => {
      await tx.memberInvitation.updateMany({
        where: { tenantId: tenant.id, email, usedAt: null },
        data: { usedAt: new Date() },
      });

      return tx.memberInvitation.create({
        data: {
          tokenHash,
          email,
          role,
          tenantId: tenant.id,
          invitedByUserId,
          expiresAt,
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
      });
    });

    const inviteUrl = this.buildUrlWithToken(this.config.getOrThrow<string>('TEAM_INVITE_URL'), rawToken);

    try {
      await this.resend.sendMemberInvite(
        email,
        inviteUrl,
        tenant.name,
        role,
        invitedBy?.name ?? invitedBy?.email,
      );
    } catch (error) {
      await this.invalidateInvitation(invitation.id);
      this.logger.error(
        `Member invitation email delivery failed for ${email}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new ServiceUnavailableException({
        code: 'MEMBER_INVITE_EMAIL_DELIVERY_FAILED',
        message: 'Member invitation email could not be sent',
      });
    }

    return serialize(invitation);
  }

  async updateRole(memberId: string, tenantId: string, dto: UpdateMemberRoleDto) {
    const member = await this.prisma.tenantMember.findFirst({ where: { id: memberId, tenantId } });
    if (!member) throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Member not found' });

    if (member.role === UserRole.superadmin) {
      throw new BadRequestException({ code: 'CANNOT_MODIFY_SUPERADMIN', message: 'Cannot change superadmin role' });
    }

    const updated = await this.prisma.tenantMember.update({
      where: { id: memberId },
      data: { role: dto.role },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    return serialize(updated);
  }

  async remove(memberId: string, tenantId: string, requestingUserId: string): Promise<void> {
    const member = await this.prisma.tenantMember.findFirst({ where: { id: memberId, tenantId } });
    if (!member) throw new NotFoundException({ code: 'MEMBER_NOT_FOUND', message: 'Member not found' });

    if (member.userId === requestingUserId) {
      throw new BadRequestException({ code: 'CANNOT_REMOVE_SELF', message: 'Cannot remove yourself from the tenant' });
    }

    await this.prisma.tenantMember.delete({ where: { id: memberId } });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private buildUrlWithToken(baseUrl: string, token: string): string {
    const url = new URL(baseUrl);
    url.searchParams.set('token', token);
    return url.toString();
  }

  private async invalidateInvitation(id: string): Promise<void> {
    try {
      await this.prisma.memberInvitation.updateMany({
        where: { id, usedAt: null },
        data: { usedAt: new Date() },
      });
    } catch (error) {
      this.logger.error(
        'Failed to invalidate member invitation after email delivery failure',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
