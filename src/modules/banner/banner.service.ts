import { Injectable, NotFoundException } from '@nestjs/common';
import { serialize } from '../../common/utils/serializer';
import { BannerRepository } from './banner.repository';
import { CreateStoreBannerDto } from './dto/create-store-banner.dto';
import { UpdateStoreBannerDto } from './dto/update-store-banner.dto';

@Injectable()
export class BannerService {
  constructor(private readonly repo: BannerRepository) {}

  async findAll(tenantId: string) {
    const banners = await this.repo.findAll(tenantId);
    return banners.map(serialize);
  }

  async findActive(tenantId: string) {
    const banners = await this.repo.findAll(tenantId, true);
    return banners.map(serialize);
  }

  async create(tenantId: string, dto: CreateStoreBannerDto) {
    const banner = await this.repo.create({
      title: dto.title,
      subtitle: dto.subtitle,
      imageUrl: dto.imageUrl,
      ctaText: dto.ctaText,
      ctaUrl: dto.ctaUrl,
      order: dto.order ?? 0,
      active: dto.active ?? true,
      tenant: { connect: { id: tenantId } },
    });

    return serialize(banner);
  }

  async update(id: string, tenantId: string, dto: UpdateStoreBannerDto) {
    await this.findByIdOrFail(id, tenantId);
    const banner = await this.repo.update(id, tenantId, dto);
    return serialize(banner);
  }

  async remove(id: string, tenantId: string): Promise<void> {
    await this.findByIdOrFail(id, tenantId);
    await this.repo.delete(id, tenantId);
  }

  private async findByIdOrFail(id: string, tenantId: string) {
    const banner = await this.repo.findById(id, tenantId);
    if (!banner) {
      throw new NotFoundException({
        code: 'BANNER_NOT_FOUND',
        message: 'Banner not found',
      });
    }
    return banner;
  }
}
