import { PartialType } from '@nestjs/mapped-types';
import { CreateStoreBannerDto } from './create-store-banner.dto';

export class UpdateStoreBannerDto extends PartialType(CreateStoreBannerDto) {}
