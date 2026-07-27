-- AlterTable: rate precision Decimal(10, 3)
ALTER TABLE "TariffZone"
  ALTER COLUMN "rate" TYPE DECIMAL(10,3)
  USING ROUND("rate"::numeric, 3);
