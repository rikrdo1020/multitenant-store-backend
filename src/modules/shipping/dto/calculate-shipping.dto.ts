import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CalculateShippingDto {
  @IsString()
  @IsNotEmpty()
  methodId: string;

  @IsOptional()
  @IsString()
  locationId?: string;
}
