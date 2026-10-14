/*
  Warnings:

  - A unique constraint covering the columns `[paypalInvoiceId]` on the table `HumanApproval` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "HumanApproval" ADD COLUMN     "paypalInvoiceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "HumanApproval_paypalInvoiceId_key" ON "HumanApproval"("paypalInvoiceId");
