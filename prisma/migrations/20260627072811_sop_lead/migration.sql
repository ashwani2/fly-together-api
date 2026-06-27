-- CreateTable
CREATE TABLE "SopLead" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "country" TEXT,
    "university" TEXT NOT NULL,
    "campus" TEXT,
    "course" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SopLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SopLead_createdAt_idx" ON "SopLead"("createdAt");
