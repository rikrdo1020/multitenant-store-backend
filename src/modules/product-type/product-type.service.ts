import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ProductTypeRepository } from './product-type.repository';
import { CreateProductTypeDto } from './dto/create-product-type.dto';
import { serialize } from '../../common/utils/serializer';
import { slugify } from '../../common/utils/slugify';
import { ComboRepository } from '../combo/combo.repository';

@Injectable()
export class ProductTypeService {
  constructor(
    private readonly repo: ProductTypeRepository,
    private readonly comboRepo: ComboRepository,
  ) {}

  async findAll(tenantId: string) {
    return (await this.repo.findAll(tenantId)).map(serialize);
  }

  async findById(id: string, tenantId: string) {
    const pt = await this.repo.findById(id, tenantId);
    if (!pt) throw new NotFoundException({ code: 'PRODUCT_TYPE_NOT_FOUND', message: 'Product type not found' });
    return serialize(pt);
  }

  async create(tenantId: string, dto: CreateProductTypeDto) {
    const slug = await this.resolveSlug(dto.slug ?? slugify(dto.name), tenantId);
    return serialize(await this.repo.create({ ...dto, slug, tenant: { connect: { id: tenantId } } }));
  }

  async update(id: string, tenantId: string, dto: Partial<CreateProductTypeDto>) {
    await this.findById(id, tenantId);
    return serialize(await this.repo.update(id, dto));
  }

  async remove(id: string, tenantId: string): Promise<void> {
    const pt = await this.repo.findById(id, tenantId);
    if (!pt) throw new NotFoundException({ code: 'PRODUCT_TYPE_NOT_FOUND', message: 'Product type not found' });

    const inUse = await this.comboRepo.isProductTypeUsed(pt.slug, tenantId);
    if (inUse) {
      throw new ConflictException({
        code: 'PRODUCT_TYPE_IN_USE',
        message: `Product type "${pt.name}" is used in one or more combos and cannot be deleted.`,
      });
    }

    await this.repo.delete(id);
  }

  private async resolveSlug(base: string, tenantId: string): Promise<string> {
    if (!(await this.repo.findBySlug(base, tenantId))) return base;
    let i = 2;
    while (await this.repo.findBySlug(`${base}-${i}`, tenantId)) i++;
    return `${base}-${i}`;
  }
}
