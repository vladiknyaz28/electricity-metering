-- AlterTable
ALTER TABLE "MeterReading" ADD COLUMN "rateT1Override" DECIMAL(10,3),
ADD COLUMN "rateT2Override" DECIMAL(10,3),
ADD COLUMN "rateT3Override" DECIMAL(10,3);
