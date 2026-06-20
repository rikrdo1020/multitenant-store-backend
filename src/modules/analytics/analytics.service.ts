import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderStatus, Prisma, ProductStatus } from '@prisma/client';

export type GroupBy = 'day' | 'week' | 'month';

export interface SalesPoint {
  period: string;
  revenue: number;
  orders: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  imageUrl: string | null;
  units: number;
  revenue: number;
}

export interface OverviewKpi {
  revenue: number;
  orders: number;
  avgTicket: number;
  revenueChange: number;
  ordersChange: number;
  avgTicketChange: number;
}

export interface CustomerMetrics {
  total: number;
  newCustomers: number;
  returning: number;
  avgTicket: number;
}

export interface LowStockProduct {
  documentId: string;
  productId: string;
  name: string;
  slug: string;
  image: string | null;
  stock: number;
  reservedStock: number;
  availableStock: number;
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
}

const COMPLETED_STATUSES = [OrderStatus.paid] as const;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(tenantId: string, from: Date, to: Date): Promise<OverviewKpi> {
    const periodMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - periodMs);
    const prevTo = new Date(from);

    const [current, previous] = await Promise.all([
      this.periodAggregates(tenantId, from, to),
      this.periodAggregates(tenantId, prevFrom, prevTo),
    ]);

    const pct = (curr: number, prev: number) =>
      prev === 0 ? 0 : Math.round(((curr - prev) / prev) * 100);

    return {
      revenue: current.revenue,
      orders: current.orders,
      avgTicket: current.avgTicket,
      revenueChange: pct(current.revenue, previous.revenue),
      ordersChange: pct(current.orders, previous.orders),
      avgTicketChange: pct(current.avgTicket, previous.avgTicket),
    };
  }

  async getSales(tenantId: string, from: Date, to: Date, groupBy: GroupBy): Promise<SalesPoint[]> {
    type RawRow = { period: Date; revenue: string; orders: bigint };

    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT
        date_trunc(${groupBy}, "createdAt") AS period,
        SUM(total)::float8                  AS revenue,
        COUNT(*)                            AS orders
      FROM "Order"
      WHERE
        "tenantId" = ${tenantId}
        AND "createdAt" >= ${from}
        AND "createdAt" < ${to}
        AND "orderStatus" = ANY(${Prisma.raw(`ARRAY['${COMPLETED_STATUSES.join("','")}']::"OrderStatus"[]`)})
      GROUP BY period
      ORDER BY period ASC
    `;

    return rows.map((r) => ({
      period: r.period.toISOString(),
      revenue: Number(r.revenue ?? 0),
      orders: Number(r.orders),
    }));
  }

  async getTopProducts(tenantId: string, limit: number, from: Date, to: Date): Promise<TopProduct[]> {
    type RawRow = {
      productId: string;
      name: string;
      imageUrl: string | null;
      units: string;
      revenue: string;
    };

    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT
        item->>'productId'                                          AS "productId",
        item->>'name'                                               AS name,
        item->>'imageUrl'                                           AS "imageUrl",
        SUM((item->>'quantity')::int)::text                         AS units,
        SUM((item->>'quantity')::int * (item->>'unitPrice')::numeric)::text AS revenue
      FROM "Order",
           jsonb_array_elements("items"::jsonb) AS item
      WHERE
        "tenantId" = ${tenantId}
        AND "createdAt" >= ${from}
        AND "createdAt" < ${to}
        AND "orderStatus" = ANY(${Prisma.raw(`ARRAY['${COMPLETED_STATUSES.join("','")}']::"OrderStatus"[]`)})
      GROUP BY "productId", name, "imageUrl"
      ORDER BY SUM((item->>'quantity')::int) DESC
      LIMIT ${limit}
    `;

    return rows.map((r) => ({
      productId: r.productId,
      name: r.name,
      imageUrl: r.imageUrl ?? null,
      units: Number(r.units),
      revenue: Number(r.revenue),
    }));
  }

  async getCustomers(tenantId: string, from: Date, to: Date): Promise<CustomerMetrics> {
    const periodMs = to.getTime() - from.getTime();
    const prevFrom = new Date(from.getTime() - periodMs);

    type RawRow = { customerId: string | null; orderCount: string; avgTicket: string };

    const rows = await this.prisma.$queryRaw<RawRow[]>`
      SELECT
        "customerId",
        COUNT(*)::text                AS "orderCount",
        AVG(total)::float8::text      AS "avgTicket"
      FROM "Order"
      WHERE
        "tenantId" = ${tenantId}
        AND "createdAt" >= ${from}
        AND "createdAt" < ${to}
      GROUP BY "customerId"
    `;

    const withCustomer = rows.filter((r) => r.customerId !== null);
    const returning = withCustomer.filter((r) => Number(r.orderCount) > 1).length;
    const total = rows.length;

    const prevCount = await this.prisma.order.count({
      where: {
        tenantId,
        createdAt: { gte: prevFrom, lt: from },
        customerId: { not: null },
      },
    });

    const allAvg = rows.reduce((sum, r) => sum + Number(r.avgTicket ?? 0), 0) / (rows.length || 1);

    return {
      total,
      newCustomers: withCustomer.length - prevCount,
      returning,
      avgTicket: Math.round(allAvg * 100) / 100,
    };
  }

  async getLowStock(
    tenantId: string,
    threshold = 5,
  ): Promise<LowStockProduct[]> {
    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        productStatus: { not: ProductStatus.archived },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        images: true,
        stock: true,
        reservedStock: true,
      },
    });

    return products
      .map((product) => {
        const availableStock = Math.max(
          0,
          product.stock - product.reservedStock,
        );

        return {
          documentId: product.id,
          productId: product.id,
          name: product.name,
          slug: product.slug,
          image: product.images[0] ?? null,
          stock: product.stock,
          reservedStock: product.reservedStock,
          availableStock,
          stockStatus: this.getStockStatus(availableStock),
        };
      })
      .filter((product) => product.availableStock <= threshold)
      .sort((a, b) => a.availableStock - b.availableStock || a.name.localeCompare(b.name));
  }

  private async periodAggregates(tenantId: string, from: Date, to: Date) {
    const agg = await this.prisma.order.aggregate({
      where: {
        tenantId,
        createdAt: { gte: from, lt: to },
        orderStatus: { in: [...COMPLETED_STATUSES] },
      },
      _sum: { total: true },
      _count: { id: true },
      _avg: { total: true },
    });

    const revenue = Number(agg._sum.total ?? 0);
    const orders = agg._count.id;
    const avgTicket = Math.round(Number(agg._avg.total ?? 0) * 100) / 100;

    return { revenue, orders, avgTicket };
  }

  private getStockStatus(availableStock: number): LowStockProduct['stockStatus'] {
    if (availableStock <= 0) return 'out_of_stock';
    if (availableStock <= 5) return 'low_stock';
    return 'in_stock';
  }
}
