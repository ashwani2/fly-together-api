-- CreateEnum: academic certificate subtypes (10th, 12th, graduation, others).
CREATE TYPE "AcademicSubType" AS ENUM ('TENTH', 'TWELFTH', 'GRADUATION', 'OTHER');

-- AlterTable: tag academic documents with their subtype.
ALTER TABLE "StudentDocument" ADD COLUMN "subType" "AcademicSubType";
