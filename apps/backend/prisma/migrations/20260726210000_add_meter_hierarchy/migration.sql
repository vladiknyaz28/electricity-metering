-- AlterTable
ALTER TABLE "Meter" ADD COLUMN "parentMeterId" TEXT;

-- AddForeignKey
ALTER TABLE "Meter" ADD CONSTRAINT "Meter_parentMeterId_fkey" FOREIGN KEY ("parentMeterId") REFERENCES "Meter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
