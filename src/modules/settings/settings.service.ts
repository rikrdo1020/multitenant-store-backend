import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { serialize } from '../../common/utils/serializer';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenant(tenantId: string) {
    const settings = await this.prisma.tenantSetting.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId },
    });
    return serialize(settings);
  }

  async update(tenantId: string, dto: UpdateSettingsDto) {
    const settings = await this.prisma.tenantSetting.upsert({
      where: { tenantId },
      create: { tenantId, ...dto },
      update: dto,
    });
    return serialize(settings);
  }
}
