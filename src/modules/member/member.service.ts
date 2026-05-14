import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { UserRole } from '@prisma/client';
import { serialize } from '../../common/utils/serializer';

@Injectable()
export class MemberService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string) {
    const members = await this.prisma.tenantMember.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, email: true, name: true, isActive: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return members.map(serialize);
  }

  async invite(tenantId: string, dto: InviteMemberDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: `No account found for ${dto.email}. They must register first.` });
    }

    const existing = await this.prisma.tenantMember.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
    });
    if (existing) {
      throw new ConflictException({ code: 'MEMBER_EXISTS', message: 'User is already a member of this tenant' });
    }

    const member = await this.prisma.tenantMember.create({
      data: {
        userId: user.id,
        tenantId,
        role: dto.role ?? UserRole.manager,
      },
      include: { user: { select: { id: true, email: true, name: true } } },
    });

    return serialize(member);
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
}
