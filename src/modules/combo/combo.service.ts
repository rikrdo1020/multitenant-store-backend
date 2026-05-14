import { Injectable, NotFoundException } from '@nestjs/common';
import { ComboRepository } from './combo.repository';
import { CreateComboDto } from './dto/create-combo.dto';
import { serialize } from '../../common/utils/serializer';

@Injectable()
export class ComboService {
  constructor(private readonly repo: ComboRepository) {}

  async findAll(tenantId: string) {
    return (await this.repo.findAll(tenantId)).map(serialize);
  }

  async findById(id: string, tenantId: string) {
    const combo = await this.repo.findById(id, tenantId);
    if (!combo) throw new NotFoundException({ code: 'COMBO_NOT_FOUND', message: 'Combo not found' });
    return serialize(combo);
  }

  async create(tenantId: string, dto: CreateComboDto) {
    return serialize(await this.repo.create({
      name: dto.name,
      price: dto.price,
      rules: dto.rules as any,
      isActive: dto.isActive ?? true,
      tenant: { connect: { id: tenantId } },
    }));
  }

  async update(id: string, tenantId: string, dto: Partial<CreateComboDto>) {
    await this.findById(id, tenantId);
    return serialize(await this.repo.update(id, dto as any));
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.findById(id, tenantId);
    await this.repo.delete(id);
  }
}
