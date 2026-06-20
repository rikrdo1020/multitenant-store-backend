-- AlterTable
ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateEnum
CREATE TYPE "EmailAction" AS ENUM (
  'password_reset',
  'member_invite',
  'order_created_customer',
  'order_created_admin',
  'payment_confirmed',
  'order_status_changed'
);

-- CreateEnum
CREATE TYPE "EmailDeliveryStatus" AS ENUM (
  'attempted',
  'sent',
  'failed',
  'blocked',
  'skipped'
);

-- CreateTable
CREATE TABLE "EmailDelivery" (
  "id" TEXT NOT NULL,
  "action" "EmailAction" NOT NULL,
  "status" "EmailDeliveryStatus" NOT NULL DEFAULT 'attempted',
  "recipientHash" TEXT NOT NULL,
  "actorHash" TEXT,
  "tenantId" TEXT,
  "dedupeKeyHash" TEXT,
  "reason" TEXT,
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDelivery_dedupeKeyHash_key" ON "EmailDelivery"("dedupeKeyHash");

-- CreateIndex
CREATE INDEX "EmailDelivery_action_recipientHash_createdAt_idx" ON "EmailDelivery"("action", "recipientHash", "createdAt");

-- CreateIndex
CREATE INDEX "EmailDelivery_action_actorHash_createdAt_idx" ON "EmailDelivery"("action", "actorHash", "createdAt");

-- CreateIndex
CREATE INDEX "EmailDelivery_action_tenantId_createdAt_idx" ON "EmailDelivery"("action", "tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailDelivery_status_createdAt_idx" ON "EmailDelivery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EmailDelivery_createdAt_idx" ON "EmailDelivery"("createdAt");
