import { IsEmail, IsIn, IsOptional } from 'class-validator';
import { UserRole } from '@prisma/client';

export class InviteMemberDto {
  @IsEmail({}, { message: 'Must be a valid email address' })
  email: string;

  @IsOptional()
  @IsIn([UserRole.admin, UserRole.manager], { message: 'Role must be admin or manager' })
  role?: UserRole;
}
