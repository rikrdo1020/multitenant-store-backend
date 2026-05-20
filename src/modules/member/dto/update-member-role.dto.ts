import { IsIn } from 'class-validator';
import { UserRole } from '@prisma/client';

export class UpdateMemberRoleDto {
  @IsIn([UserRole.admin, UserRole.manager], { message: 'Role must be admin or manager' })
  role: UserRole;
}
