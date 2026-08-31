-- CreateTable
CREATE TABLE "SystemLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "SimulationState" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "activeWorldId" TEXT,
    "speed" REAL NOT NULL DEFAULT 1,
    "year" INTEGER NOT NULL DEFAULT 1,
    "month" INTEGER NOT NULL DEFAULT 1,
    "day" INTEGER NOT NULL DEFAULT 1,
    "hour" INTEGER NOT NULL DEFAULT 0,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "second" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SimulationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scheduledTimeJson" TEXT NOT NULL,
    "createdTimeJson" TEXT NOT NULL,
    "executionTimeJson" TEXT,
    "completionTimeJson" TEXT,
    "handlerName" TEXT NOT NULL,
    "metadataJson" TEXT,
    "tagsJson" TEXT,
    "sourceModule" TEXT NOT NULL,
    "targetModule" TEXT NOT NULL,
    "recurrenceInterval" TEXT,
    "recurrenceCount" INTEGER,
    "cancelFlag" BOOLEAN NOT NULL DEFAULT false,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "executionResultJson" TEXT,
    "executionDurationMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "World" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "metadataJson" TEXT,
    "description" TEXT NOT NULL,
    "randomSeed" INTEGER NOT NULL,
    "creationTime" INTEGER NOT NULL,
    "currentPopulation" INTEGER NOT NULL DEFAULT 0,
    "worldSize" INTEGER NOT NULL,
    "climateProfile" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "metadataJson" TEXT,
    "description" TEXT NOT NULL,
    "climate" TEXT NOT NULL,
    "population" INTEGER NOT NULL DEFAULT 0,
    "coordX" INTEGER NOT NULL,
    "coordY" INTEGER NOT NULL,
    "worldId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Region_worldId_fkey" FOREIGN KEY ("worldId") REFERENCES "World" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "metadataJson" TEXT,
    "population" INTEGER NOT NULL DEFAULT 0,
    "coordX" INTEGER NOT NULL,
    "coordY" INTEGER NOT NULL,
    "area" INTEGER NOT NULL,
    "regionId" TEXT NOT NULL,
    "districtCount" INTEGER NOT NULL DEFAULT 0,
    "buildingCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "City_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "District" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "metadataJson" TEXT,
    "type" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "District_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "metadataJson" TEXT,
    "type" TEXT NOT NULL,
    "coordX" INTEGER NOT NULL,
    "coordY" INTEGER NOT NULL,
    "capacity" INTEGER NOT NULL,
    "ownerId" TEXT,
    "status" TEXT NOT NULL,
    "districtId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Building_districtId_fkey" FOREIGN KEY ("districtId") REFERENCES "District" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "metadataJson" TEXT,
    "type" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "objectIdsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Room_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "renewable" BOOLEAN NOT NULL,
    "regionId" TEXT NOT NULL,
    "currentAmount" REAL NOT NULL,
    "maximumAmount" REAL NOT NULL,
    "naturalRecoveryRate" REAL,
    "consumptionRate" REAL,
    "conditionType" TEXT,
    "conditionValue" REAL,
    "extractionDifficulty" REAL NOT NULL DEFAULT 0,
    "tradable" BOOLEAN NOT NULL DEFAULT true,
    "borrowable" BOOLEAN NOT NULL DEFAULT false,
    "exportable" BOOLEAN NOT NULL DEFAULT true,
    "reservedAmount" REAL NOT NULL DEFAULT 0,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Resource_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Workplace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "occupiedPositions" INTEGER NOT NULL DEFAULT 0,
    "vacancies" INTEGER NOT NULL DEFAULT 0,
    "inventoryId" TEXT,
    "storageCapacity" INTEGER,
    "walletId" TEXT,
    "revenue" REAL NOT NULL DEFAULT 0,
    "expenses" REAL NOT NULL DEFAULT 0,
    "profit" REAL NOT NULL DEFAULT 0,
    "accountingHistoryJson" TEXT,
    "inventoryConfigJson" TEXT,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Workplace_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "workplaceId" TEXT NOT NULL,
    "requiredSkillsJson" TEXT NOT NULL,
    "occupantId" TEXT,
    "scheduleStartHour" INTEGER NOT NULL,
    "scheduleEndHour" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobPosition_workplaceId_fkey" FOREIGN KEY ("workplaceId") REFERENCES "Workplace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JobPosition_occupantId_fkey" FOREIGN KEY ("occupantId") REFERENCES "Citizen" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Household" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "locationId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Citizen" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "birthDateJson" TEXT NOT NULL,
    "createdAtSimJson" TEXT NOT NULL,
    "locationId" TEXT,
    "vitalStateJson" TEXT NOT NULL,
    "personalityJson" TEXT NOT NULL,
    "walletId" TEXT,
    "movementState" TEXT NOT NULL DEFAULT 'IDLE',
    "activeRouteJson" TEXT,
    "skillsJson" TEXT NOT NULL,
    "employmentStatus" TEXT NOT NULL,
    "workplaceId" TEXT,
    "jobType" TEXT,
    "jobScheduleJson" TEXT,
    "householdId" TEXT,
    "employmentRecJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Citizen_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "Household" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Inventory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "storageCapacity" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "inventoryId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "totalQuantity" REAL NOT NULL,
    "reservedQuantity" REAL NOT NULL DEFAULT 0,
    "availableQuantity" REAL NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "quality" REAL,
    "batchesJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InventoryItem_inventoryId_fkey" FOREIGN KEY ("inventoryId") REFERENCES "Inventory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "balance" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'CREDIT',
    "totalIncome" REAL NOT NULL DEFAULT 0,
    "totalExpenses" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TransactionRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "timestamp" INTEGER NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "productId" TEXT,
    "quantity" REAL,
    "unit" TEXT,
    "unitPrice" REAL,
    "totalPrice" REAL NOT NULL,
    "currency" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "regionId" TEXT NOT NULL,
    "description" TEXT,
    "referenceId" TEXT,
    "referenceType" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" REAL,
    "totalPrice" REAL,
    "currency" TEXT,
    "status" TEXT NOT NULL,
    "createdAtSim" INTEGER NOT NULL,
    "expectedDelivery" INTEGER,
    "shipmentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shipmentId" TEXT NOT NULL,
    "originId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "unit" TEXT NOT NULL,
    "transportationMode" TEXT NOT NULL,
    "routeId" TEXT,
    "departureTime" INTEGER,
    "estimatedArrival" INTEGER,
    "status" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Region_worldId_idx" ON "Region"("worldId");

-- CreateIndex
CREATE INDEX "City_regionId_idx" ON "City"("regionId");

-- CreateIndex
CREATE INDEX "District_cityId_idx" ON "District"("cityId");

-- CreateIndex
CREATE INDEX "Building_districtId_idx" ON "Building"("districtId");

-- CreateIndex
CREATE INDEX "Room_buildingId_idx" ON "Room"("buildingId");

-- CreateIndex
CREATE INDEX "Resource_regionId_idx" ON "Resource"("regionId");

-- CreateIndex
CREATE INDEX "Workplace_regionId_idx" ON "Workplace"("regionId");

-- CreateIndex
CREATE INDEX "Workplace_locationId_idx" ON "Workplace"("locationId");

-- CreateIndex
CREATE INDEX "JobPosition_workplaceId_idx" ON "JobPosition"("workplaceId");

-- CreateIndex
CREATE INDEX "JobPosition_occupantId_idx" ON "JobPosition"("occupantId");

-- CreateIndex
CREATE INDEX "Citizen_locationId_idx" ON "Citizen"("locationId");

-- CreateIndex
CREATE INDEX "Citizen_householdId_idx" ON "Citizen"("householdId");

-- CreateIndex
CREATE INDEX "Inventory_ownerId_idx" ON "Inventory"("ownerId");

-- CreateIndex
CREATE INDEX "InventoryItem_inventoryId_idx" ON "InventoryItem"("inventoryId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_inventoryId_productId_key" ON "InventoryItem"("inventoryId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_ownerId_key" ON "Wallet"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "TransactionRecord_transactionId_key" ON "TransactionRecord"("transactionId");

-- CreateIndex
CREATE INDEX "TransactionRecord_buyerId_idx" ON "TransactionRecord"("buyerId");

-- CreateIndex
CREATE INDEX "TransactionRecord_sellerId_idx" ON "TransactionRecord"("sellerId");

-- CreateIndex
CREATE INDEX "TransactionRecord_regionId_idx" ON "TransactionRecord"("regionId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderId_key" ON "Order"("orderId");

-- CreateIndex
CREATE INDEX "Order_buyerId_idx" ON "Order"("buyerId");

-- CreateIndex
CREATE INDEX "Order_sellerId_idx" ON "Order"("sellerId");

-- CreateIndex
CREATE UNIQUE INDEX "Shipment_shipmentId_key" ON "Shipment"("shipmentId");

-- CreateIndex
CREATE INDEX "Shipment_originId_idx" ON "Shipment"("originId");

-- CreateIndex
CREATE INDEX "Shipment_destinationId_idx" ON "Shipment"("destinationId");
