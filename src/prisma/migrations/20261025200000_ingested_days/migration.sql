-- Jours publiés en entier par une source (B1610 d'Elexon remplace les PN provisoires)
CREATE TABLE "ingested_days" (
    "source" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingested_days_pkey" PRIMARY KEY ("source","day")
);
