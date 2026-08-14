-- CreateEnum
CREATE TYPE "Granularity" AS ENUM ('HOUR', 'DAY');

-- CreateTable
CREATE TABLE "reactors" (
    "eic_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "production_type" TEXT NOT NULL DEFAULT 'NUCLEAR',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reactors_pkey" PRIMARY KEY ("eic_code")
);

-- CreateTable
CREATE TABLE "production_readings" (
    "eic_code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "production_type" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "granularity" "Granularity" NOT NULL DEFAULT 'HOUR',
    "value" DOUBLE PRECISION NOT NULL,
    "updated_date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "production_readings_pkey" PRIMARY KEY ("eic_code","start_date","granularity")
);

-- CreateIndex
CREATE INDEX "production_readings_start_date_granularity_idx" ON "production_readings"("start_date", "granularity");

-- AddForeignKey
ALTER TABLE "production_readings" ADD CONSTRAINT "production_readings_eic_code_fkey" FOREIGN KEY ("eic_code") REFERENCES "reactors"("eic_code") ON DELETE RESTRICT ON UPDATE CASCADE;
