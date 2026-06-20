-- Formal stock reservation and fulfillment tracking support.

ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'processing';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'ready';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'shipped';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'delivered';

ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "reservedStock" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "pricingBreakdown" JSONB,
  ADD COLUMN IF NOT EXISTS "trackingNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "trackingCarrier" TEXT,
  ADD COLUMN IF NOT EXISTS "trackingUrl" TEXT;

CREATE TABLE IF NOT EXISTS "OrderStatusHistory" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" "OrderStatus" NOT NULL,
  "note" TEXT,
  "changedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "OrderStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderStatusHistory_orderId_createdAt_idx"
  ON "OrderStatusHistory"("orderId", "createdAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'OrderStatusHistory_orderId_fkey'
  ) THEN
    ALTER TABLE "OrderStatusHistory"
      ADD CONSTRAINT "OrderStatusHistory_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
