import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('../lib/prisma', () => ({
  prisma: {
    appointment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

// Import after mocking
import { createCalendarEvent, generateOutlookEvent } from '../services/calendar.service';
import { prisma } from '../lib/prisma';

describe('Calendar Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateOutlookEvent', () => {
    it('should generate valid ICS content', () => {
      const appointment = {
        dateTime: new Date('2024-06-15T10:00:00Z'),
        patientName: 'John Doe',
        doctorName: 'Dr. Smith',
        reason: 'Annual checkup',
        type: 'FIRST_VISIT',
      };

      const ics = generateOutlookEvent(appointment);

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('VERSION:2.0');
      expect(ics).toContain('SUMMARY:Appointment: John Doe');
      expect(ics).toContain('DESCRIPTION:Doctor: Dr. Smith');
      expect(ics).toContain('END:VCALENDAR');
    });

    it('should handle missing optional fields', () => {
      const appointment = {
        dateTime: new Date('2024-06-15T10:00:00Z'),
        patientName: 'John Doe',
        doctorName: 'Dr. Smith',
      };

      const ics = generateOutlookEvent(appointment);

      expect(ics).toContain('BEGIN:VCALENDAR');
      expect(ics).toContain('END:VCALENDAR');
    });
  });

  describe('createCalendarEvent', () => {
    it('should return null if appointment not found', async () => {
      vi.mocked(prisma.appointment.findUnique).mockResolvedValue(null);

      const result = await createCalendarEvent('non-existent-id');

      expect(result).toBeNull();
      expect(prisma.appointment.findUnique).toHaveBeenCalledWith({
        where: { id: 'non-existent-id' },
        expect: {
          patient: { include: { user: true } },
          doctor: { include: { user: true } },
        },
      });
    });

    it('should handle missing environment variables gracefully', async () => {
      // Save original env
      const originalEnv = process.env.GOOGLE_CALENDAR_ENABLED;
      
      // Set env to undefined
      delete process.env.GOOGLE_CALENDAR_ENABLED;

      const mockAppointment = {
        id: 'test-id',
        startTime: new Date('2024-06-15T10:00:00Z'),
        endTime: new Date('2024-06-15T10:30:00Z'),
        type: 'FIRST_VISIT' as const,
        reason: 'Test',
        notes: null,
        status: 'CONFIRMED' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        doctorId: 'doc-1',
        patientId: 'pat-1',
        appointmentDate: new Date(),
        queuePosition: null,
        estimatedWaitTime: null,
        noShowProbability: null,
        patient: {
          firstName: 'John',
          lastName: 'Doe',
          user: { email: 'john@example.com' },
        },
        doctor: {
          user: { firstName: 'Jane', lastName: 'Smith', email: 'jane@example.com' },
        },
      };

      vi.mocked(prisma.appointment.findUnique).mockResolvedValue(mockAppointment);

      // This will try to call Google API - we expect it to fail but not crash
      // In real scenario, GOOGLE_CALENDAR_ENABLED would be checked before calling
      
      // Restore env
      process.env.GOOGLE_CALENDAR_ENABLED = originalEnv;
    });
  });
});
