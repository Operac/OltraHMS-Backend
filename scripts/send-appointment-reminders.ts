/**
 * Appointment Reminder Script
 * 
 * This script sends appointment reminder emails to patients
 * Run this script daily (e.g., via cron at 9 AM) to remind patients of upcoming appointments
 * 
 * Usage: npx ts-node backend/scripts/send-appointment-reminders.ts
 */

import { prisma } from '../src/lib/prisma';
import { sendAppointmentReminderEmail } from '../src/services/email.service';
import { addHours, isWithinInterval, subHours } from 'date-fns';

const REMINDER_HOURS_BEFORE = 24; // Send reminder 24 hours before
const REMINDER_WINDOW_HOURS = 48; // Look at appointments in the next 48 hours

interface AppointmentReminder {
  id: string;
  appointmentDate: Date;
  patientEmail: string | null;
  patientName: string;
  doctorName: string;
  type: string;
}

async function sendAppointmentReminders() {
  console.log('🔔 Sending appointment reminders...\n');

  try {
    const now = new Date();
    const reminderWindowStart = addHours(now, REMINDER_HOURS_BEFORE);
    const reminderWindowEnd = addHours(now, REMINDER_WINDOW_HOURS);

    // Find appointments in the reminder window that haven't been reminded yet
    const appointments = await prisma.appointment.findMany({
      where: {
        appointmentDate: {
          gte: reminderWindowStart,
          lte: reminderWindowEnd,
        },
        status: {
          in: ['CONFIRMED', 'REQUESTED'],
        },
        // Only remind if not cancelled
      },
      include: {
        patient: {
          include: {
            user: {
              select: {
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        doctor: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (appointments.length === 0) {
      console.log('✅ No appointments to remind about!');
      return;
    }

    console.log(`📋 Found ${appointments.length} appointments to remind\n`);

    let successCount = 0;
    let failCount = 0;

    for (const appointment of appointments) {
      const patientEmail = appointment.patient?.user?.email;
      const patientName = appointment.patient 
        ? `${appointment.patient.firstName} ${appointment.patient.lastName}`
        : 'Patient';
      const doctorName = appointment.doctor
        ? `Dr. ${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}`
        : 'Your Doctor';
      
      if (!patientEmail) {
        console.log(`⚠️  Skipping appointment ${appointment.id} - no patient email`);
        failCount++;
        continue;
      }

      const appointmentDate = new Date(appointment.appointmentDate);
      const formattedDate = appointmentDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const formattedTime = appointmentDate.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });

      try {
        await sendAppointmentReminderEmail(
          patientEmail,
          patientName,
          doctorName,
          formattedDate,
          formattedTime
        );
        
        console.log(`✅ Reminder sent to ${patientEmail} for appointment on ${formattedDate}`);
        successCount++;
      } catch (emailError) {
        console.error(`❌ Failed to send reminder to ${patientEmail}:`, emailError);
        failCount++;
      }
    }

    console.log(`\n📊 Summary: ${successCount} sent, ${failCount} failed`);
    return { successCount, failCount };

  } catch (error) {
    console.error('❌ Error sending reminders:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
sendAppointmentReminders()
  .then(result => {
    if (result) {
      console.log(`\n✅ Reminder job completed`);
    }
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
