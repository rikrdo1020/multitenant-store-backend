import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantStatus } from '@prisma/client';
import { serialize, serializeList } from '../../common/utils/serializer';

@Injectable()
export class SuperadminService {
  constructor(private readonly prisma: PrismaService) {}

  async listTenants(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.tenant.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { id: true, email: true, name: true } },
          _count: { select: { members: true, products: true, orders: true } },
        },
      }),
      this.prisma.tenant.count(),
    ]);
    return serializeList(items, { page, pageSize, total });
  }

  async getTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, email: true, name: true } },
        settings: true,
        _count: { select: { members: true, products: true, orders: true, customers: true } },
      },
    });
    if (!tenant) throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Tenant not found' });
    return serialize(tenant);
  }

  async setTenantStatus(id: string, status: TenantStatus) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException({ code: 'TENANT_NOT_FOUND', message: 'Tenant not found' });

    const updated = await this.prisma.tenant.update({ where: { id }, data: { status } });
    return serialize(updated);
  }

  async listUsers(page = 1, pageSize = 20) {
    const skip = (page - 1) * pageSize;
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          name: true,
          isActive: true,
          createdAt: true,
          tenants: { select: { role: true, tenant: { select: { id: true, slug: true, name: true } } } },
        },
      }),
      this.prisma.user.count(),
    ]);
    return serializeList(items, { page, pageSize, total });
  }

  async setUserActive(id: string, isActive: boolean) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException({ code: 'USER_NOT_FOUND', message: 'User not found' });

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, email: true, name: true, isActive: true },
    });
    return serialize(updated);
  }
}
