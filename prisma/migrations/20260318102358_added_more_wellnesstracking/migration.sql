-- AlterTable
ALTER TABLE "Staff" ADD COLUMN     "telemedicineAvailable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "telemedicineEndTime" TEXT NOT NULL DEFAULT '17:00',
ADD COLUMN     "telemedicineStartTime" TEXT NOT NULL DEFAULT '09:00';

-- CreateTable
CREATE TABLE "HospitalSettings" (
    "id" TEXT NOT NULL,
    "mondayOpen" TEXT NOT NULL DEFAULT '08:00',
    "mondayClose" TEXT NOT NULL DEFAULT '17:00',
    "mondayIsOpen" BOOLEAN NOT NULL DEFAULT true,
    "tuesdayOpen" TEXT NOT NULL DEFAULT '08:00',
    "tuesdayClose" TEXT NOT NULL DEFAULT '17:00',
    "tuesdayIsOpen" BOOLEAN NOT NULL DEFAULT true,
    "wednesdayOpen" TEXT NOT NULL DEFAULT '08:00',
    "wednesdayClose" TEXT NOT NULL DEFAULT '17:00',
    "wednesdayIsOpen" BOOLEAN NOT NULL DEFAULT true,
    "thursdayOpen" TEXT NOT NULL DEFAULT '08:00',
    "thursdayClose" TEXT NOT NULL DEFAULT '17:00',
    "thursdayIsOpen" BOOLEAN NOT NULL DEFAULT true,
    "fridayOpen" TEXT NOT NULL DEFAULT '08:00',
    "fridayClose" TEXT NOT NULL DEFAULT '17:00',
    "fridayIsOpen" BOOLEAN NOT NULL DEFAULT true,
    "saturdayOpen" TEXT NOT NULL DEFAULT '09:00',
    "saturdayClose" TEXT NOT NULL DEFAULT '13:00',
    "saturdayIsOpen" BOOLEAN NOT NULL DEFAULT true,
    "sundayOpen" TEXT NOT NULL DEFAULT '00:00',
    "sundayClose" TEXT NOT NULL DEFAULT '00:00',
    "sundayIsOpen" BOOLEAN NOT NULL DEFAULT false,
    "telemedicineEnabled" BOOLEAN NOT NULL DEFAULT true,
    "telemedicineStart" TEXT NOT NULL DEFAULT '00:00',
    "telemedicineEnd" TEXT NOT NULL DEFAULT '23:59',
    "telemedicine24Hours" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HospitalSettings_pkey" PRIMARY KEY ("id")
);
