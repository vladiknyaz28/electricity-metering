-- Tariff versioning: resourceTypeId, familyId; Consumer.tariffId becomes familyId (no FK).

-- Drop Consumer → Tariff FK (tariffId will store familyId)
ALTER TABLE "Consumer" DROP CONSTRAINT IF EXISTS "Consumer_tariffId_fkey";

-- New columns
ALTER TABLE "Tariff" ADD COLUMN IF NOT EXISTS "resourceTypeId" TEXT;
ALTER TABLE "Tariff" ADD COLUMN IF NOT EXISTS "familyId" TEXT;

-- Backfill resourceTypeId = Электроэнергия for existing rows
UPDATE "Tariff" AS t
SET "resourceTypeId" = rt.id
FROM "ResourceType" AS rt
WHERE rt.name = 'Электроэнергия'
  AND t."resourceTypeId" IS NULL;

-- Safety: if somehow still null, create nothing — fail loudly by requiring NOT NULL after
-- familyId = own id; validFrom fallback to createdAt if needed
UPDATE "Tariff"
SET
  "familyId" = id,
  "validFrom" = COALESCE("validFrom", "createdAt"),
  "validTo" = "validTo"
WHERE "familyId" IS NULL;

-- Consumer.tariffId already points to tariff id (= familyId after backfill); no change needed

ALTER TABLE "Tariff" ALTER COLUMN "resourceTypeId" SET NOT NULL;

ALTER TABLE "Tariff"
  ADD CONSTRAINT "Tariff_resourceTypeId_fkey"
  FOREIGN KEY ("resourceTypeId") REFERENCES "ResourceType"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Tariff_familyId_idx" ON "Tariff"("familyId");
