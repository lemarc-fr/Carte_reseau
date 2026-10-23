-- La table des réacteurs devient la table générique des groupes de production
-- (réacteurs, groupes hydrauliques, éoliennes en mer) : renommage sans perte de données.
ALTER TABLE "reactors" RENAME TO "units";
ALTER TABLE "units" RENAME CONSTRAINT "reactors_pkey" TO "units_pkey";
ALTER TABLE "units" RENAME CONSTRAINT "reactors_plant_id_fkey" TO "units_plant_id_fkey";
ALTER INDEX "reactors_plant_id_idx" RENAME TO "units_plant_id_idx";

-- Centrales de tous types
ALTER TABLE "plants" ADD COLUMN "technology" TEXT,
ADD COLUMN "region_code" TEXT,
ADD COLUMN "installations" INTEGER;

-- Séries agrégées (production nationale par filière, taux de charge régionaux)
CREATE TABLE "aggregate_readings" (
    "series" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "granularity" "Granularity" NOT NULL DEFAULT 'HOUR',
    "value" DOUBLE PRECISION NOT NULL,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aggregate_readings_pkey" PRIMARY KEY ("series","start_date","granularity")
);

CREATE INDEX "aggregate_readings_start_date_granularity_idx" ON "aggregate_readings"("start_date", "granularity");
