-- CreateEnum
CREATE TYPE "StaffDailyStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'ON_LEAVE', 'IN_SURGERY', 'SEEING_PATIENTS');

-- AlterTable
ALTER TABLE "HospitalSettings" ADD COLUMN     "timeSlotDuration" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "fridayEnd" TEXT NOT NULL DEFAULT '16:00',
ADD COLUMN     "fridayIsOpen" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fridayStart" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN     "mondayEnd" TEXT NOT NULL DEFAULT '16:00',
ADD COLUMN     "mondayIsOpen" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "mondayStart" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN     "saturdayEnd" TEXT NOT NULL DEFAULT '13:00',
ADD COLUMN     "saturdayIsOpen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "saturdayStart" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "sundayEnd" TEXT NOT NULL DEFAULT '13:00',
ADD COLUMN     "sundayIsOpen" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sundayStart" TEXT NOT NULL DEFAULT '09:00',
ADD COLUMN     "thursdayEnd" TEXT NOT NULL DEFAULT '16:00',
ADD COLUMN     "thursdayIsOpen" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "thursdayStart" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN     "tuesdayEnd" TEXT NOT NULL DEFAULT '16:00',
ADD COLUMN     "tuesdayIsOpen" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "tuesdayStart" TEXT NOT NULL DEFAULT '08:00',
ADD COLUMN     "wednesdayEnd" TEXT NOT NULL DEFAULT '16:00',
ADD COLUMN     "wednesdayIsOpen" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "wednesdayStart" TEXT NOT NULL DEFAULT '08:00';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastResetIp" TEXT;

-- CreateTable
CREATE TABLE "StaffDailyAvailability" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "StaffDailyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffDailyAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StaffDailyAvailability_staffId_date_key" ON "StaffDailyAvailability"("staffId", "date");

-- AddForeignKey
ALTER TABLE "StaffDailyAvailability" ADD CONSTRAINT "StaffDailyAvailability_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
