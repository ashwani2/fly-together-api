/*
  Warnings:

  - You are about to drop the column `universityId` on the `Application` table. All the data in the column will be lost.
  - Added the required column `universityName` to the `Application` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Application" DROP CONSTRAINT "Application_universityId_fkey";

-- AlterTable
ALTER TABLE "Application" DROP COLUMN "universityId",
ADD COLUMN     "universityName" TEXT NOT NULL;
