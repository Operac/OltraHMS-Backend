import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { getDay, format } from 'date-fns';

const prisma = new PrismaClient();

/**
 * Check if a doctor is available on a given date/time
 * Uses Two-Layer Availability Model:
 * - Layer 1: Weekly schedule (staff fields: mondayIsOpen, mondayStart, etc.)
 * - Layer 2: Daily override (StaffDailyAvailability table)
 * 
 * @param staffId - The staff ID
 * @param date - The date to check
 * @param appointmentType - Optional: 'TELEMEDICINE' or 'IN_PERSON' to check specific type
 */
export const isDoctorAvailable = async (
  staffId: string, 
  date: Date,
  appointmentType?: 'TELEMEDICINE' | 'IN_PERSON'
): Promise<{ available: boolean; reason?: string }> => {
  // Get the staff member
  const staff = await prisma.staff.findUnique({
    where: { id: staffId },
    include: { dailyAvailabilities: true }
  });

  if (!staff) {
    return { available: false, reason: 'Staff not found' };
  }

  // Get hospital settings for telemedicine config
  const hospitalSettings = await prisma.hospitalSettings.findFirst();
  const telemedicineEnabled = hospitalSettings?.telemedicineEnabled ?? true;
  const telemedicine24Hours = hospitalSettings?.telemedicine24Hours ?? true;
  const telemedicineStart = hospitalSettings?.telemedicineStart || '00:00';
  const telemedicineEnd = hospitalSettings?.telemedicineEnd || '23:59';

  // Check if telemedicine is requested but doctor doesn't have it enabled
  if (appointmentType === 'TELEMEDICINE') {
    if (!staff.telemedicineAvailable) {
      return { available: false, reason: 'Doctor does not offer telemedicine appointments' };
    }
    
    // Check telemedicine hours (hospital-wide)
    if (!telemedicine24Hours) {
      const timeStr = format(date, 'HH:mm');
      if (timeStr < telemedicineStart || timeStr > telemedicineEnd) {
        return { available: false, reason: `Telemedicine only available from ${telemedicineStart} to ${telemedicineEnd}` };
      }
    }
  }

  // Get day of week (0 = Sunday, 1 = Monday, etc.)
  const dayOfWeek = getDay(date);
  const dayMap: { [key: number]: { isOpen: boolean; start: string; end: string } } = {
    0: { isOpen: staff.sundayIsOpen, start: staff.sundayStart, end: staff.sundayEnd },
    1: { isOpen: staff.mondayIsOpen, start: staff.mondayStart, end: staff.mondayEnd },
    2: { isOpen: staff.tuesdayIsOpen, start: staff.tuesdayStart, end: staff.tuesdayEnd },
    3: { isOpen: staff.wednesdayIsOpen, start: staff.wednesdayStart, end: staff.wednesdayEnd },
    4: { isOpen: staff.thursdayIsOpen, start: staff.thursdayStart, end: staff.thursdayEnd },
    5: { isOpen: staff.fridayIsOpen, start: staff.fridayStart, end: staff.fridayEnd },
    6: { isOpen: staff.saturdayIsOpen, start: staff.saturdayStart, end: staff.saturdayEnd },
  };

  const daySchedule = dayMap[dayOfWeek];

  // Check Layer 1: Weekly schedule (for in-person)
  // For telemedicine, we use the weekly schedule if doctor offers it
  if (appointmentType !== 'TELEMEDICINE') {
    if (!daySchedule.isOpen) {
      return { available: false, reason: 'Doctor is not scheduled to work on this day' };
    }

    // Check if current time is within working hours
    const timeStr = format(date, 'HH:mm');
    if (timeStr < daySchedule.start || timeStr > daySchedule.end) {
      return { available: false, reason: `Doctor works from ${daySchedule.start} to ${daySchedule.end} on this day` };
    }
  } else {
    // For telemedicine, check doctor's specific telemedicine hours
    // Use telemedicine-specific hours if set, otherwise use weekly schedule
    const teleStart = staff.telemedicineStartTime || telemedicineStart;
    const teleEnd = staff.telemedicineEndTime || telemedicineEnd;
    
    const timeStr = format(date, 'HH:mm');
    if (timeStr < teleStart || timeStr > teleEnd) {
      return { available: false, reason: `Doctor's telemedicine hours are ${teleStart} to ${teleEnd}` };
    }
  }

  // Check Layer 2: Daily override (applies to both in-person and telemedicine)
  const dateStart = new Date(date);
  dateStart.setHours(0, 0, 0, 0);
  const dateEnd = new Date(date);
  dateEnd.setHours(23, 59, 59, 999);

  const dailyOverride = staff.dailyAvailabilities.find(
    (d) => d.date >= dateStart && d.date <= dateEnd
  );

  if (dailyOverride) {
    if (dailyOverride.status === 'UNAVAILABLE' || 
        dailyOverride.status === 'ON_LEAVE' || 
        dailyOverride.status === 'IN_SURGERY') {
      return { 
        available: false, 
        reason: dailyOverride.reason || `Doctor is marked as ${dailyOverride.status.toLowerCase().replace('_', ' ')}` 
      };
    }
    
    // If SEEING_PATIENTS, still allow but could show as busy for new bookings
    if (dailyOverride.status === 'SEEING_PATIENTS') {
      return { available: true };
    }
  }

  return { available: true };
};

/**
 * Get available doctors for a specific date
 */
export const getAvailableDoctorsForDate = async (date: Date) => {
  // Get all active doctors
  const doctors = await prisma.staff.findMany({
    where: {
      user: { role: 'DOCTOR' },
      employmentStatus: 'ACTIVE',
      isDeleted: false
    },
    include: { dailyAvailabilities: true }
  });

  const availableDoctors = [];

  for (const doctor of doctors) {
    const availability = await isDoctorAvailable(doctor.id, date);
    if (availability.available) {
      availableDoctors.push(doctor);
    }
  }

  return availableDoctors;
};

/**
 * Set daily availability override (Layer 2)
 */
export const setDailyAvailability = async (
  staffId: string,
  date: Date,
  status: 'AVAILABLE' | 'UNAVAILABLE' | 'ON_LEAVE' | 'IN_SURGERY' | 'SEEING_PATIENTS',
  reason?: string
) => {
  const dateStart = new Date(date);
  dateStart.setHours(0, 0, 0, 0);

  return prisma.staffDailyAvailability.upsert({
    where: {
      staffId_date: {
        staffId,
        date: dateStart
      }
    },
    update: { status, reason },
    create: {
      staffId,
      date: dateStart,
      status,
      reason
    }
  });
};
