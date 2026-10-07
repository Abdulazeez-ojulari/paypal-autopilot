-- CreateTable
CREATE TABLE "PaypalWebhookEvent" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "summary" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PaypalWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaypalWebhookEvent_eventId_key" ON "PaypalWebhookEvent"("eventId");

-- CreateIndex
CREATE INDEX "PaypalWebhookEvent_eventType_idx" ON "PaypalWebhookEvent"("eventType");

-- CreateIndex
CREATE INDEX "PaypalWebhookEvent_resourceId_idx" ON "PaypalWebhookEvent"("resourceId");
