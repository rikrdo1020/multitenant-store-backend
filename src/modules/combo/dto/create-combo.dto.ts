import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class ComboRuleDto {
  @IsString()
  @IsNotEmpty()
  productType: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity: number;
}

export class CreateComboDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Type(() => Number)
  price: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ComboRuleDto)
  rules: ComboRuleDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
