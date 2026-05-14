import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { MemberService } from './member.service';
import { InviteMemberDto } from './dto/invite-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { CurrentUser } from '../../common/decorators/user.decorator';
import { UserRole, Tenant } from '@prisma/client';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.superadmin)
@Controller('members')
export class MemberController {
  constructor(private readonly memberService: MemberService) {}

  @Get()
  findAll(@CurrentTenant() tenant: Tenant) {
    return this.memberService.findAll(tenant.id);
  }

  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  invite(@CurrentTenant() tenant: Tenant, @Body() dto: InviteMemberDto) {
    return this.memberService.invite(tenant.id, dto);
  }

  @Put(':id/role')
  updateRole(
    @Param('id') id: string,
    @CurrentTenant() tenant: Tenant,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.memberService.updateRole(id, tenant.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id') id: string,
    @CurrentTenant() tenant: Tenant,
    @CurrentUser() user: { sub: string },
  ) {
    return this.memberService.remove(id, tenant.id, user.sub);
  }
}
