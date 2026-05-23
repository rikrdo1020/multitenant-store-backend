-- Add hashed public view token support for guest order tracking.
ALTER TABLE "Order" ADD COLUMN "viewTokenHash" TEXT;

CREATE UNIQUE INDEX "Order_viewTokenHash_key" ON "Order"("viewTokenHash");
