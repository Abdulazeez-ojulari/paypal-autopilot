-- CreateTable
CREATE TABLE "HumanApproval" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "decisionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "executionStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "executionAttemptKey" TEXT,
    "executionResult" JSONB,
    "executedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HumanApproval_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HumanApproval_decisionId_key" ON "HumanApproval"("decisionId");

-- CreateIndex
CREATE UNIQUE INDEX "HumanApproval_executionAttemptKey_key" ON "HumanApproval"("executionAttemptKey");

-- CreateIndex
CREATE INDEX "HumanApproval_businessId_status_createdAt_idx" ON "HumanApproval"("businessId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "HumanApproval_businessId_executionStatus_idx" ON "HumanApproval"("businessId", "executionStatus");

-- AddForeignKey
ALTER TABLE "HumanApproval" ADD CONSTRAINT "HumanApproval_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanApproval" ADD CONSTRAINT "HumanApproval_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "AiDecision"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanApproval" ADD CONSTRAINT "HumanApproval_decidedByUserId_fkey" FOREIGN KEY ("decidedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
