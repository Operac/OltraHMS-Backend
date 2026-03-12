import { google, calendar_v3 } from 'googleapis';
import { prisma } from '../lib/prisma';

/**
 * Calendar Service
 * Provides integration with Google Calendar for appointments
 * Also supports Outlook/Office 365 calendar integration
 */

const SCOPES = ['https://www.googleapis.com/auth/calendar'];

/**
 * Initialize Google Calendar API client
 */
function getCalendarClient(): calendar_v3.Calendar {
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    },
    scopes: SCOPES,
  });

  return google.calendar({ version: 'v3', auth });
}

/**
 * Create a Google Calendar event for an appointment
 */
export async function createCalendarEvent(appointmentId: string): Promise<string | null> {
  try {
    // Get appointment with patient and doctor details
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: {
          include: { user: true }
        },
        doctor: {
          include: { user: true },
        },
      },
    });

    if (!appointment) {
      console.error('Appointment not found:', appointmentId);
      return null;
    }

    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    // Format date-time for Google Calendar
    const startTime = new Date(appointment.startTime);
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // Default 30 min

    const event: calendar_v3.Schema$Event = {
      summary: `Appointment: ${appointment.patient.firstName} ${appointment.patient.lastName}`,
      description: `
Patient: ${appointment.patient.firstName} ${appointment.patient.lastName}
Doctor: Dr. ${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}
Type: ${appointment.type || 'Consultation'}
Reason: ${appointment.reason || 'Not specified'}
      `.trim(),
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'UTC',
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'UTC',
      },
      attendees: [
        { email: appointment.patient.user.email },
        { email: appointment.doctor.user.email },
      ],
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'email', minutes: 24 * 60 }, // 24 hours
          { method: 'popup', minutes: 30 }, // 30 minutes
        ],
      },
    };

    const response = await calendar.events.insert({
      calendarId,
      requestBody: event,
    });

    // Store calendar event ID in appointment
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { notes: JSON.stringify({ calendarEventId: response.data.id }) },
    });

    return response.data.id || null;
  } catch (error) {
    console.error('Error creating calendar event:', error);
    return null;
  }
}

/**
 * Update a Google Calendar event
 */
export async function updateCalendarEvent(
  appointmentId: string,
  updates: {
    dateTime?: Date;
    reason?: string;
    type?: string;
  }
): Promise<boolean> {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        doctor: {
          include: { user: true },
        },
      },
    });

    if (!appointment) return false;

    const notes = appointment.notes ? JSON.parse(appointment.notes) : {};
    const calendarEventId = notes.calendarEventId;

    if (!calendarEventId) return false;

    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    const event: calendar_v3.Schema$Event = {};

    if (updates.dateTime) {
      const startTime = new Date(updates.dateTime);
      const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);
      event.start = { dateTime: startTime.toISOString(), timeZone: 'UTC' };
      event.end = { dateTime: endTime.toISOString(), timeZone: 'UTC' };
    }

    if (updates.reason || updates.type) {
      event.description = `
Patient: ${appointment.patient.firstName} ${appointment.patient.lastName}
Doctor: Dr. ${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}
Type: ${updates.type || appointment.type || 'Consultation'}
Reason: ${updates.reason || appointment.reason || 'Not specified'}
      `.trim();
    }

    await calendar.events.patch({
      calendarId,
      eventId: calendarEventId,
      requestBody: event,
    });

    return true;
  } catch (error) {
    console.error('Error updating calendar event:', error);
    return false;
  }
}

/**
 * Delete a Google Calendar event
 */
export async function deleteCalendarEvent(appointmentId: string): Promise<boolean> {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
    });

    if (!appointment) return false;

    const notes = appointment.notes ? JSON.parse(appointment.notes) : {};
    const calendarEventId = notes.calendarEventId;

    if (!calendarEventId) return false;

    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    await calendar.events.delete({
      calendarId,
      eventId: calendarEventId,
    });

    return true;
  } catch (error) {
    console.error('Error deleting calendar event:', error);
    return false;
  }
}

/**
 * Get free/busy slots from Google Calendar
 */
export async function getFreeBusySlots(
  doctorId: string,
  date: Date
): Promise<{ start: string; end: string }[]> {
  try {
    const doctor = await prisma.staff.findUnique({
      where: { id: doctorId },
      include: { user: true },
    });

    if (!doctor || !doctor.user.email) {
      return [];
    }

    const calendar = getCalendarClient();
    const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const response = await calendar.freebusy.query({
      requestBody: {
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        items: [{ id: calendarId }],
      },
    });

    const busySlots = response.data.calendars?.[calendarId]?.busy || [];
    return busySlots.map((slot) => ({
      start: slot.start || '',
      end: slot.end || '',
    }));
  } catch (error) {
    console.error('Error getting free/busy slots:', error);
    return [];
  }
}

/**
 * Generate Outlook/Office 365 calendar event (returns iCal string)
 * This can be used to generate .ics files for Outlook integration
 */
export function generateOutlookEvent(appointment: {
  dateTime: Date;
  patientName: string;
  doctorName: string;
  reason?: string;
  type?: string;
}): string {
  const startTime = new Date(appointment.dateTime);
  const endTime = new Date(startTime.getTime() + 30 * 60 * 1000);

  const formatDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//OltraHMS//Appointment//EN
BEGIN:VEVENT
UID:${Date.now()}@oltrahms.com
DTSTAMP:${formatDate(new Date())}
DTSTART:${formatDate(startTime)}
DTEND:${formatDate(endTime)}
SUMMARY:Appointment: ${appointment.patientName}
DESCRIPTION:Doctor: ${appointment.doctorName}\\nType: ${appointment.type || 'Consultation'}\\nReason: ${appointment.reason || 'Not specified'}
END:VEVENT
END:VCALENDAR`;

  return ics;
}
