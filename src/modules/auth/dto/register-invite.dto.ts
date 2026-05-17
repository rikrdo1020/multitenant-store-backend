import { IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterInviteDto {
  @IsString()
  @IsNotEmpty({ message: 'Invitation token is required' })
  @MaxLength(256, { message: 'Invitation token is too long' })
  token: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password too long' })
  password?: string;
}
