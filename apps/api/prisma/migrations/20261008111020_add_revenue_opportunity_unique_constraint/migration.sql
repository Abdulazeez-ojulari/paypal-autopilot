/*
  Warnings:

  - A unique constraint covering the columns `[invoiceId,type]` on the table `RevenueOpportunity` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "RevenueOpportunity_invoiceId_type_key" ON "RevenueOpportunity"("invoiceId", "type");
