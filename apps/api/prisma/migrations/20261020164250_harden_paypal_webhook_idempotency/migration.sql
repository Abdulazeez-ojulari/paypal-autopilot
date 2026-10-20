/*
  Warnings:

  - A unique constraint covering the columns `[idempotencyKey]` on the table `PaypalPaymentEvent` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "PaypalPaymentEvent" ADD COLUMN     "idempotencyKey" TEXT;

-- AlterTable
ALTER TABLE "PaypalWebhookEvent" ADD COLUMN     "processing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "PaypalPaymentEvent_idempotencyKey_key" ON "PaypalPaymentEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PaypalWebhookEvent_processed_processing_idx" ON "PaypalWebhookEvent"("processed", "processing");
