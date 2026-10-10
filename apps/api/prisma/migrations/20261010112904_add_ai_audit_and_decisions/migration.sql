-- CreateTable
CREATE TABLE "AiRun" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "invoiceCount" INTEGER NOT NULL,
    "totalOutstanding" DECIMAL(18,2) NOT NULL,
    "estimatedRecovery" DECIMAL(18,2) NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiDecision" (
    "id" TEXT NOT NULL,
    "aiRunId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "estimatedRecovery" DECIMAL(18,2) NOT NULL,
    "requiresApproval" BOOLEAN NOT NULL,
    "policyStatus" TEXT NOT NULL,
    "policyReason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiRun_businessId_createdAt_idx" ON "AiRun"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "AiRun_status_idx" ON "AiRun"("status");

-- CreateIndex
CREATE INDEX "AiDecision_invoiceId_idx" ON "AiDecision"("invoiceId");

-- CreateIndex
CREATE INDEX "AiDecision_policyStatus_idx" ON "AiDecision"("policyStatus");

-- CreateIndex
CREATE UNIQUE INDEX "AiDecision_aiRunId_invoiceId_key" ON "AiDecision"("aiRunId", "invoiceId");

-- AddForeignKey
ALTER TABLE "AiRun" ADD CONSTRAINT "AiRun_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiDecision" ADD CONSTRAINT "AiDecision_aiRunId_fkey" FOREIGN KEY ("aiRunId") REFERENCES "AiRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
