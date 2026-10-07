-- CreateTable
CREATE TABLE "PaypalOrder" (
    "id" TEXT NOT NULL,
    "paypalOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currencyCode" TEXT,
    "amount" DECIMAL(18,2),
    "approvalUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaypalOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaypalCapture" (
    "id" TEXT NOT NULL,
    "paypalCaptureId" TEXT NOT NULL,
    "paypalOrderId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currencyCode" TEXT,
    "amount" DECIMAL(18,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaypalCapture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaypalOrder_paypalOrderId_key" ON "PaypalOrder"("paypalOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaypalCapture_paypalCaptureId_key" ON "PaypalCapture"("paypalCaptureId");

-- CreateIndex
CREATE INDEX "PaypalCapture_paypalOrderId_idx" ON "PaypalCapture"("paypalOrderId");

-- AddForeignKey
ALTER TABLE "PaypalCapture" ADD CONSTRAINT "PaypalCapture_paypalOrderId_fkey" FOREIGN KEY ("paypalOrderId") REFERENCES "PaypalOrder"("paypalOrderId") ON DELETE RESTRICT ON UPDATE CASCADE;
