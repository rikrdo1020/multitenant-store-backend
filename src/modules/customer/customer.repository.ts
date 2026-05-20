import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Customer, CustomerAddress, Prisma } from '@prisma/client';

export interface CustomerUserSnapshot {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
}

@Injectable()
export class CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(tenantId: string, skip: number, take: number, search?: string): Promise<Customer[]> {
    return this.prisma.customer.findMany({
      where: {
        tenantId,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      skip,
      take,
      orderBy: { createdAt: 'desc' },
    });
  }

  count(tenantId: string, search?: string): Promise<number> {
    return this.prisma.customer.count({
      where: {
        tenantId,
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
    });
  }

  findById(id: string, tenantId: string): Promise<Customer | null> {
    return this.prisma.customer.findFirst({ where: { id, tenantId } });
  }

  findByEmail(email: string, tenantId: string): Promise<Customer | null> {
    return this.prisma.customer.findUnique({ where: { email_tenantId: { email, tenantId } } });
  }

  findUserById(id: string): Promise<CustomerUserSnapshot | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, phone: true },
    });
  }

  hasTenantMembership(userId: string, tenantId: string): Promise<{ id: string } | null> {
    return this.prisma.tenantMember.findFirst({
      where: { userId, tenantId },
      select: { id: true },
    });
  }

  create(data: Prisma.CustomerCreateInput): Promise<Customer> {
    return this.prisma.customer.create({ data });
  }

  update(id: string, data: Prisma.CustomerUpdateInput): Promise<Customer> {
    return this.prisma.customer.update({ where: { id }, data });
  }

  delete(id: string): Promise<Customer> {
    return this.prisma.customer.delete({ where: { id } });
  }

  findAddresses(customerId: string): Promise<CustomerAddress[]> {
    return this.prisma.customerAddress.findMany({
      where: { customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  }

  countAddresses(customerId: string): Promise<number> {
    return this.prisma.customerAddress.count({ where: { customerId } });
  }

  findAddressById(id: string, customerId: string): Promise<CustomerAddress | null> {
    return this.prisma.customerAddress.findFirst({ where: { id, customerId } });
  }

  createAddress(
    customerId: string,
    data: Omit<Prisma.CustomerAddressCreateInput, 'customer'>,
    makeDefault: boolean,
  ): Promise<CustomerAddress> {
    return this.prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId },
          data: { isDefault: false },
        });
      }

      return tx.customerAddress.create({
        data: {
          ...data,
          isDefault: makeDefault,
          customer: { connect: { id: customerId } },
        },
      });
    });
  }

  updateAddress(
    id: string,
    customerId: string,
    data: Prisma.CustomerAddressUpdateInput,
    makeDefault: boolean,
  ): Promise<CustomerAddress> {
    return this.prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.customerAddress.updateMany({
          where: { customerId, id: { not: id } },
          data: { isDefault: false },
        });
      }

      return tx.customerAddress.update({
        where: { id },
        data: {
          ...data,
          ...(makeDefault ? { isDefault: true } : {}),
        },
      });
    });
  }

  deleteAddress(id: string, customerId: string): Promise<void> {
    return this.prisma.$transaction(async (tx) => {
      const address = await tx.customerAddress.findFirst({ where: { id, customerId } });
      if (!address) return;

      await tx.customerAddress.delete({ where: { id } });

      if (address.isDefault) {
        const nextDefault = await tx.customerAddress.findFirst({
          where: { customerId },
          orderBy: { createdAt: 'desc' },
        });

        if (nextDefault) {
          await tx.customerAddress.update({
            where: { id: nextDefault.id },
            data: { isDefault: true },
          });
        }
      }
    });
  }
}
