-- CreateTable
CREATE TABLE "MemberInvitation" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'manager',
    "tenantId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberInvitation_tokenHash_key" ON "MemberInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "MemberInvitation_tenantId_idx" ON "MemberInvitation"("tenantId");

-- CreateIndex
CREATE INDEX "MemberInvitation_email_tenantId_idx" ON "MemberInvitation"("email", "tenantId");

-- CreateIndex
CREATE INDEX "MemberInvitation_expiresAt_idx" ON "MemberInvitation"("expiresAt");

-- AddForeignKey
ALTER TABLE "MemberInvitation" ADD CONSTRAINT "MemberInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberInvitation" ADD CONSTRAINT "MemberInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
