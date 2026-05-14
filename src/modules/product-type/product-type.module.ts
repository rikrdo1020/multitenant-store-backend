import { Module } from '@nestjs/common';
import { ProductTypeController } from './product-type.controller';
import { ProductTypeService } from './product-type.service';
import { ProductTypeRepository } from './product-type.repository';

@Module({
  controllers: [ProductTypeController],
  providers: [ProductTypeService, ProductTypeRepository],
})
export class ProductTypeModule {}
