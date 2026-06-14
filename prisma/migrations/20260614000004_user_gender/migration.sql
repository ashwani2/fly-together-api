-- CreateEnum: optional user gender.
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHERS');

-- AlterTable: add optional gender to users.
ALTER TABLE "User" ADD COLUMN "gender" "Gender";
