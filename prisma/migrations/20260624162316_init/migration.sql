-- CreateTable
CREATE TABLE "ProductionValue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eicCode" TEXT NOT NULL,
    "reactorName" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "updatedDate" DATETIME NOT NULL,
    "valueMw" REAL NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductionValue_eicCode_startDate_key" ON "ProductionValue"("eicCode", "startDate");
