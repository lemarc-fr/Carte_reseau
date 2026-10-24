-- Plusieurs pays : chaque centrale porte son pays, les séries régionales sont préfixées par le pays
ALTER TABLE "plants" ADD COLUMN "country" TEXT NOT NULL DEFAULT 'FR';
CREATE INDEX "plants_country_idx" ON "plants"("country");

-- "REGION:84:WIND" -> "FR-84:WIND"
UPDATE "aggregate_readings"
SET "series" = 'FR-' || split_part("series", ':', 2) || ':' || split_part("series", ':', 3)
WHERE "series" LIKE 'REGION:%';
