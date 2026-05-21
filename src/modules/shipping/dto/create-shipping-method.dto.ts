import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ShippingType } from '@prisma/client';
import { Type } from 'class-transformer';

export class ShippingLocationDto {
  @IsString()
  @IsNotEmpty()
  key: string;

  @IsString()
  @IsNotEmpty()
  label: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  extraPrice?: number;
}

export class CreateShippingMethodDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(ShippingType)
  type: ShippingType;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  basePrice?: number;

  @IsOptional()
  @IsBoolean()
  requiresDetails?: boolean;

  @IsOptional()
  @IsString()
  disclaimer?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ShippingLocationDto)
  locations?: ShippingLocationDto[];
}
