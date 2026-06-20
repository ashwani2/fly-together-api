-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'DOCUMENTS_REQUESTED', 'APPROVED', 'REJECTED', 'DISBURSED');

-- AlterTable: migrate LoanApplication.status from TEXT to LoanStatus enum
-- Map legacy values: PENDING → SUBMITTED, APPROVED → APPROVED, REJECTED → REJECTED
UPDATE "LoanApplication"
SET "status" = CASE
  WHEN "status" = 'APPROVED' THEN 'APPROVED'
  WHEN "status" = 'REJECTED' THEN 'REJECTED'
  ELSE 'SUBMITTED'
END;

ALTER TABLE "LoanApplication" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "LoanApplication"
  ALTER COLUMN "status" TYPE "LoanStatus"
  USING "status"::"LoanStatus";
ALTER TABLE "LoanApplication" ALTER COLUMN "status" SET DEFAULT 'SUBMITTED';

-- CreateTable
CREATE TABLE "LoanApplicationTimeline" (
    "id" TEXT NOT NULL,
    "loanApplicationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actionTakenBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoanApplicationTimeline_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LoanApplicationTimeline" ADD CONSTRAINT "LoanApplicationTimeline_loanApplicationId_fkey"
  FOREIGN KEY ("loanApplicationId") REFERENCES "LoanApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
