import { Module } from '@nestjs/common';
import { ProductTypeController } from './product-type.controller';
import { ProductTypeService } from './product-type.service';
import { ProductTypeRepository } from './product-type.repository';
import { ComboModule } from '../combo/combo.module';

@Module({
  imports: [ComboModule],
  controllers: [ProductTypeController],
  providers: [ProductTypeService, ProductTypeRepository],
})
export class ProductTypeModule {}
