import { Controller, Get, Query } from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { Public } from '../../common/decorators/roles.decorator';
import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

class MarketplacePaginationQuery {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) pageSize?: number;
}

@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Public()
  @Get('stores')
  listStores(@Query() query: MarketplacePaginationQuery) {
    return this.marketplaceService.listStores(query.page, query.pageSize);
  }
}
