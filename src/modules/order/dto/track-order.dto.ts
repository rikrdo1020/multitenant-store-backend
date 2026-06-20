import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class TrackOrderDto {
  @IsString()
  @IsNotEmpty()
  orderId: string;

  @IsEmail()
  email: string;
}
