-- Add active flag for pausing shipping methods without deleting their configuration.
ALTER TABLE "ShippingMethod" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
