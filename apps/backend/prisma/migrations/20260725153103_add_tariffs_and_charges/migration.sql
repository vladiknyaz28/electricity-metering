/*
  Warnings:

  - Added the required column `readingDate` to the `MeterReading` table without a default value. This is not possible if the table is not empty.
  - Added the required column `valueT1` to the `MeterReading` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Consumer" ADD COLUMN     "tariffId" TEXT;

-- AlterTable
ALTER TABLE "MeterReading" ADD COLUMN     "comment" TEXT,
ADD COLUMN     "readingDate" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "valueT1" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "valueT2" DOUBLE PRECISION,
ADD COLUMN     "valueT3" DOUBLE PRECISION,
ALTER COLUMN "source" SET DEFAULT 'manual';

-- CreateTable
CREATE TABLE "Tariff" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "resourceTypeCode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tariff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TariffZone" (
    "id" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "zoneCode" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TariffZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "consumerId" TEXT NOT NULL,
    "meterId" TEXT NOT NULL,
    "tariffId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "startReadingId" TEXT NOT NULL,
    "endReadingId" TEXT NOT NULL,
    "consumptionT1" DOUBLE PRECISION NOT NULL,
    "consumptionT2" DOUBLE PRECISION,
    "consumptionT3" DOUBLE PRECISION,
    "amountT1" DOUBLE PRECISION NOT NULL,
    "amountT2" DOUBLE PRECISION,
    "amountT3" DOUBLE PRECISION,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TariffZone_tariffId_zoneCode_key" ON "TariffZone"("tariffId", "zoneCode");

-- AddForeignKey
ALTER TABLE "Consumer" ADD CONSTRAINT "Consumer_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TariffZone" ADD CONSTRAINT "TariffZone_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_consumerId_fkey" FOREIGN KEY ("consumerId") REFERENCES "Consumer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_meterId_fkey" FOREIGN KEY ("meterId") REFERENCES "Meter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_tariffId_fkey" FOREIGN KEY ("tariffId") REFERENCES "Tariff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_startReadingId_fkey" FOREIGN KEY ("startReadingId") REFERENCES "MeterReading"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_endReadingId_fkey" FOREIGN KEY ("endReadingId") REFERENCES "MeterReading"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
