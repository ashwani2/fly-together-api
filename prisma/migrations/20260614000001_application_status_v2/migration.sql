-- AlterEnum: Replace old ApplicationStatus values with new ones, migrating existing data.

-- 1. Drop the default so we can change the column type freely
ALTER TABLE "Application" ALTER COLUMN "status" DROP DEFAULT;

-- 2. Create the new enum type
CREATE TYPE "ApplicationStatus_new" AS ENUM (
  'CREATED',
  'REJECTED',
  'DOCUMENT_VERIFIED',
  'SENT_TO_UNIVERSITY',
  'PENDING_WITH_UNIVERSITY',
  'VERIFIED_BY_UNIVERSITY',
  'PAYMENT_PENDING',
  'COMPLETED'
);

-- 3. Migrate existing data and change column type
ALTER TABLE "Application"
  ALTER COLUMN "status" TYPE "ApplicationStatus_new"
  USING (
    CASE "status"::text
      WHEN 'PROFILE'      THEN 'CREATED'
      WHEN 'DOCUMENTS'    THEN 'DOCUMENT_VERIFIED'
      WHEN 'VERIFICATION' THEN 'DOCUMENT_VERIFIED'
      WHEN 'APPLICATION'  THEN 'SENT_TO_UNIVERSITY'
      WHEN 'PAYMENT'      THEN 'PAYMENT_PENDING'
      WHEN 'COMPLETED'    THEN 'COMPLETED'
      ELSE 'CREATED'
    END::"ApplicationStatus_new"
  );

-- 4. Set the new default
ALTER TABLE "Application" ALTER COLUMN "status" SET DEFAULT 'CREATED'::"ApplicationStatus_new";

-- 5. Drop old type and rename new
DROP TYPE "ApplicationStatus";
ALTER TYPE "ApplicationStatus_new" RENAME TO "ApplicationStatus";
