-- One-time cleanup: broken ResourceType names from encoding issues.
-- Detach meters, then delete non-system ResourceType rows whose names
-- contain no letters (only ?, replacement chars, digits, punctuation).

UPDATE "Meter" AS m
SET "resourceTypeId" = NULL
FROM "ResourceType" AS rt
WHERE m."resourceTypeId" = rt.id
  AND rt."isSystem" = false
  AND rt.name !~ '[A-Za-zА-Яа-яЁё]';

DELETE FROM "ResourceType"
WHERE "isSystem" = false
  AND name !~ '[A-Za-zА-Яа-яЁё]';
