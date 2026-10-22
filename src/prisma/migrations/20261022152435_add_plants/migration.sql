-- AlterTable
ALTER TABLE "reactors" ADD COLUMN     "capacity_mw" DOUBLE PRECISION,
ADD COLUMN     "commissioning_date" DATE,
ADD COLUMN     "plant_id" TEXT;

-- CreateTable
CREATE TABLE "plants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "production_type" TEXT NOT NULL DEFAULT 'NUCLEAR',
    "operator" TEXT,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "capacity_mw" DOUBLE PRECISION NOT NULL,
    "commissioning_date" DATE,
    "commune" TEXT,
    "departement" TEXT,
    "region" TEXT,
    "wikidata_id" TEXT,
    "osm_id" TEXT,
    "contour" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reactors_plant_id_idx" ON "reactors"("plant_id");

-- AddForeignKey
ALTER TABLE "reactors" ADD CONSTRAINT "reactors_plant_id_fkey" FOREIGN KEY ("plant_id") REFERENCES "plants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
