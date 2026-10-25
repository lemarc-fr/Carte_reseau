-- Groupes de plusieurs pays (RTE, ENTSO-E) : chaque groupe porte le pays qui le publie
ALTER TABLE "units" ADD COLUMN "country" TEXT NOT NULL DEFAULT 'FR';
CREATE INDEX "units_country_idx" ON "units"("country");
