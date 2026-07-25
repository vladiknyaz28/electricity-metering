-- Rename existing CT fields and switch coefficient to nullable Decimal ratio
ALTER TABLE "Meter" RENAME COLUMN "currentTransformerPrimary" TO "primaryCurrent";
ALTER TABLE "Meter" RENAME COLUMN "currentTransformerSecondary" TO "secondaryCurrent";

ALTER TABLE "Meter" ADD COLUMN "transformerRatio" DECIMAL(10,4);

UPDATE "Meter"
SET "transformerRatio" = "transformationCoefficient"
WHERE "hasCurrentTransformer" = true;

UPDATE "Meter"
SET "transformerRatio" = NULL
WHERE "hasCurrentTransformer" = false;

ALTER TABLE "Meter" DROP COLUMN "transformationCoefficient";
