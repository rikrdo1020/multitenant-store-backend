import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderStatus } from '@prisma/client';
import { AnalyticsService } from './analytics.service';

const mockPrisma = {
  $queryRaw: vi.fn(),
  order: {
    aggregate: vi.fn(),
    count: vi.fn(),
  },
};

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  const tenantId = 'tenant-1';
  const from = new Date('2026-04-01T00:00:00Z');
  const to = new Date('2026-05-01T00:00:00Z');

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AnalyticsService(mockPrisma as any);
  });

  describe('getOverview', () => {
    it('returns KPIs with pct change vs previous period', async () => {
      mockPrisma.order.aggregate
        .mockResolvedValueOnce({ _sum: { total: 1000 }, _count: { id: 10 }, _avg: { total: 100 } })
        .mockResolvedValueOnce({ _sum: { total: 800 }, _count: { id: 8 }, _avg: { total: 100 } });

      const result = await service.getOverview(tenantId, from, to);

      expect(result.revenue).toBe(1000);
      expect(result.orders).toBe(10);
      expect(result.avgTicket).toBe(100);
      expect(result.revenueChange).toBe(25);
      expect(result.ordersChange).toBe(25);
      expect(result.avgTicketChange).toBe(0);
    });

    it('returns 0 pct change when previous period has no orders', async () => {
      mockPrisma.order.aggregate
        .mockResolvedValueOnce({ _sum: { total: 500 }, _count: { id: 5 }, _avg: { total: 100 } })
        .mockResolvedValueOnce({ _sum: { total: null }, _count: { id: 0 }, _avg: { total: null } });

      const result = await service.getOverview(tenantId, from, to);

      expect(result.revenueChange).toBe(0);
      expect(result.ordersChange).toBe(0);
    });
  });

  describe('getSales', () => {
    it('maps raw rows to SalesPoint array', async () => {
      const rawRows = [
        { period: new Date('2026-04-01'), revenue: '300', orders: BigInt(3) },
        { period: new Date('2026-04-02'), revenue: '450.5', orders: BigInt(4) },
      ];
      mockPrisma.$queryRaw.mockResolvedValue(rawRows);

      const result = await service.getSales(tenantId, from, to, 'day');

      expect(result).toHaveLength(2);
      expect(result[0].revenue).toBe(300);
      expect(result[1].revenue).toBe(450.5);
      expect(result[0].orders).toBe(3);
      expect(result[0].period).toBe(new Date('2026-04-01').toISOString());
    });

    it('returns empty array when no orders', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      const result = await service.getSales(tenantId, from, to, 'week');
      expect(result).toEqual([]);
    });
  });

  describe('getTopProducts', () => {
    it('maps raw rows to TopProduct array', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { productId: 'p1', name: 'Producto A', imageUrl: 'https://img.com/a.jpg', units: '20', revenue: '400' },
        { productId: 'p2', name: 'Producto B', imageUrl: null, units: '10', revenue: '200' },
      ]);

      const result = await service.getTopProducts(tenantId, 5, from, to);

      expect(result).toHaveLength(2);
      expect(result[0].units).toBe(20);
      expect(result[0].revenue).toBe(400);
      expect(result[1].imageUrl).toBeNull();
    });
  });

  describe('getCustomers', () => {
    it('computes new and returning correctly', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        { customerId: 'c1', orderCount: '1', avgTicket: '100' },
        { customerId: 'c2', orderCount: '3', avgTicket: '200' },
        { customerId: null, orderCount: '1', avgTicket: '50' },
      ]);
      mockPrisma.order.count.mockResolvedValue(1);

      const result = await service.getCustomers(tenantId, from, to);

      expect(result.total).toBe(3);
      expect(result.returning).toBe(1);
      expect(result.newCustomers).toBe(1);
    });

    it('handles no customers gracefully', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);
      mockPrisma.order.count.mockResolvedValue(0);

      const result = await service.getCustomers(tenantId, from, to);

      expect(result.total).toBe(0);
      expect(result.returning).toBe(0);
      expect(result.newCustomers).toBe(0);
    });
  });
});
