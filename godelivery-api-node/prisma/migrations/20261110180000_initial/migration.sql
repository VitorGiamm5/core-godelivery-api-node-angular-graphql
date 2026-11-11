-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'operator',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OidcRecord" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "grantId" TEXT,
    "userCode" TEXT,
    "uid" TEXT,

    CONSTRAINT "OidcRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MotorcycleModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,

    CONSTRAINT "MotorcycleModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Motorcycle" (
    "id" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "plateNormalized" TEXT NOT NULL,
    "yearManufacture" INTEGER NOT NULL,
    "modelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Motorcycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deliverier" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "cnpj" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deliverier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "issueDate" TIMESTAMP(3) NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "objectKey" TEXT,
    "mimeType" TEXT,
    "deliverierId" TEXT NOT NULL,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RentalPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "dailyCost" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "RentalPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rental" (
    "id" TEXT NOT NULL,
    "deliverierId" TEXT NOT NULL,
    "motorcycleId" TEXT,
    "planId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "estimatedReturnDate" TIMESTAMP(3) NOT NULL,
    "returnedToBaseDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rental_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "motorcycleId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OidcRecord_userCode_key" ON "OidcRecord"("userCode");

-- CreateIndex
CREATE UNIQUE INDEX "OidcRecord_uid_key" ON "OidcRecord"("uid");

-- CreateIndex
CREATE INDEX "OidcRecord_grantId_idx" ON "OidcRecord"("grantId");

-- CreateIndex
CREATE INDEX "OidcRecord_expiresAt_idx" ON "OidcRecord"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "MotorcycleModel_normalized_key" ON "MotorcycleModel"("normalized");

-- CreateIndex
CREATE UNIQUE INDEX "Motorcycle_plateNormalized_key" ON "Motorcycle"("plateNormalized");

-- CreateIndex
CREATE UNIQUE INDEX "Deliverier_cnpj_key" ON "Deliverier"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "License_deliverierId_key" ON "License"("deliverierId");

-- CreateIndex
CREATE UNIQUE INDEX "RentalPlan_name_key" ON "RentalPlan"("name");

-- CreateIndex
CREATE INDEX "Rental_motorcycleId_idx" ON "Rental"("motorcycleId");

-- AddForeignKey
ALTER TABLE "Motorcycle" ADD CONSTRAINT "Motorcycle_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "MotorcycleModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_deliverierId_fkey" FOREIGN KEY ("deliverierId") REFERENCES "Deliverier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_deliverierId_fkey" FOREIGN KEY ("deliverierId") REFERENCES "Deliverier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "Motorcycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rental" ADD CONSTRAINT "Rental_planId_fkey" FOREIGN KEY ("planId") REFERENCES "RentalPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_motorcycleId_fkey" FOREIGN KEY ("motorcycleId") REFERENCES "Motorcycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Rental_active_motorcycle_key" ON "Rental"("motorcycleId") WHERE "returnedToBaseDate" IS NULL AND "motorcycleId" IS NOT NULL;
