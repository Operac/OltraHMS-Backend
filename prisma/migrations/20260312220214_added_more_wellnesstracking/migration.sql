/*
  Warnings:

  - You are about to drop the column `patientId` on the `MedicationLog` table. All the data in the column will be lost.
  - You are about to drop the column `prescriptionId` on the `MedicationLog` table. All the data in the column will be lost.
  - You are about to drop the column `taken` on the `MedicationLog` table. All the data in the column will be lost.
  - Added the required column `medicationId` to the `MedicationLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `scheduledTime` to the `MedicationLog` table without a default value. This is not possible if the table is not empty.
  - Added the required column `status` to the `MedicationLog` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "MedicationLog" DROP CONSTRAINT "MedicationLog_patientId_fkey";

-- AlterTable
ALTER TABLE "MedicationLog" DROP COLUMN "patientId",
DROP COLUMN "prescriptionId",
DROP COLUMN "taken",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "medicationId" TEXT NOT NULL,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "scheduledTime" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "status" TEXT NOT NULL,
ALTER COLUMN "takenAt" DROP NOT NULL,
ALTER COLUMN "takenAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "WellnessVitals" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "value2" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WellnessVitals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessMedication" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "times" TEXT NOT NULL,
    "instructions" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WellnessMedication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessMood" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "moodScore" INTEGER NOT NULL,
    "stressLevel" INTEGER,
    "energyLevel" INTEGER,
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WellnessMood_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessSleep" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "bedtime" TIMESTAMP(3) NOT NULL,
    "wakeTime" TIMESTAMP(3) NOT NULL,
    "quality" INTEGER,
    "notes" TEXT,
    "duration" INTEGER,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WellnessSleep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessSymptom" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "symptom" TEXT NOT NULL,
    "severity" INTEGER NOT NULL,
    "frequency" TEXT,
    "location" TEXT,
    "triggers" TEXT,
    "notes" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WellnessSymptom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WellnessReminder" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "time" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "daysOfWeek" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WellnessReminder_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "WellnessVitals" ADD CONSTRAINT "WellnessVitals_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessMedication" ADD CONSTRAINT "WellnessMedication_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationLog" ADD CONSTRAINT "MedicationLog_medicationId_fkey" FOREIGN KEY ("medicationId") REFERENCES "WellnessMedication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessMood" ADD CONSTRAINT "WellnessMood_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessSleep" ADD CONSTRAINT "WellnessSleep_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessSymptom" ADD CONSTRAINT "WellnessSymptom_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WellnessReminder" ADD CONSTRAINT "WellnessReminder_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
