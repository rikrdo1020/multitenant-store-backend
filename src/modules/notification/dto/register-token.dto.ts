import { IsEnum, IsString, IsNotEmpty } from 'class-validator';
import { NotificationPlatform } from '@prisma/client';

export class RegisterTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsEnum(NotificationPlatform)
  platform: NotificationPlatform;
}
