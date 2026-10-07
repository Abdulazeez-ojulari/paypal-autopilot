-- CreateTable
CREATE TABLE "PaypalPaymentEvent" (
    "id" TEXT NOT NULL,
    "paypalOrderId" TEXT,
    "paypalCaptureId" TEXT,
    "source" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "previousStatus" TEXT,
    "newStatus" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaypalPaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaypalPaymentEvent_paypalOrderId_idx" ON "PaypalPaymentEvent"("paypalOrderId");

-- CreateIndex
CREATE INDEX "PaypalPaymentEvent_paypalCaptureId_idx" ON "PaypalPaymentEvent"("paypalCaptureId");

-- CreateIndex
CREATE INDEX "PaypalPaymentEvent_eventType_idx" ON "PaypalPaymentEvent"("eventType");

-- CreateIndex
CREATE INDEX "PaypalPaymentEvent_createdAt_idx" ON "PaypalPaymentEvent"("createdAt");
