/*
  Warnings:

  - You are about to drop the column `eicCode` on the `ProductionValue` table. All the data in the column will be lost.
  - You are about to drop the column `reactorName` on the `ProductionValue` table. All the data in the column will be lost.
  - Added the required column `unitId` to the `ProductionValue` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Unit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "eicCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plantName" TEXT NOT NULL,
    "commune" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "productionType" TEXT NOT NULL,
    "puisMaxMw" REAL NOT NULL,
    "sourceFile" TEXT NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProductionValue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "unitId" INTEGER NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "updatedDate" DATETIME NOT NULL,
    "valueMw" REAL NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductionValue_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ProductionValue" ("endDate", "fetchedAt", "id", "startDate", "updatedDate", "valueMw") SELECT "endDate", "fetchedAt", "id", "startDate", "updatedDate", "valueMw" FROM "ProductionValue";
DROP TABLE "ProductionValue";
ALTER TABLE "new_ProductionValue" RENAME TO "ProductionValue";
CREATE INDEX "ProductionValue_unitId_startDate_idx" ON "ProductionValue"("unitId", "startDate");
CREATE INDEX "ProductionValue_startDate_idx" ON "ProductionValue"("startDate");
CREATE INDEX "ProductionValue_unitId_idx" ON "ProductionValue"("unitId");
CREATE UNIQUE INDEX "ProductionValue_unitId_startDate_key" ON "ProductionValue"("unitId", "startDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Unit_eicCode_key" ON "Unit"("eicCode");
