-- CreateTable
CREATE TABLE "FlywirePayment" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "flywireId" TEXT NOT NULL,
    "reference" TEXT,
    "payLink" TEXT,
    "flywireStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlywirePayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FlywirePayment_applicationId_key" ON "FlywirePayment"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "FlywirePayment_flywireId_key" ON "FlywirePayment"("flywireId");

-- AddForeignKey
ALTER TABLE "FlywirePayment" ADD CONSTRAINT "FlywirePayment_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
