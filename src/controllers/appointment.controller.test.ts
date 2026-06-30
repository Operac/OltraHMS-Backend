import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';
import { Request, Response } from 'express';
import { AppointmentStatus } from '@prisma/client';

// Mock Prisma. Built via vi.hoisted so $transaction can run its callback against
// the same mock object (the controller now wraps overlap-check + create in a
// serializable transaction via runSerializable).
const { prismaMock } = vi.hoisted(() => {
  const m: any = {
    appointment: {
      findFirst: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    staff: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    patient: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
  };
  // Run the interactive-transaction callback against the same mock instance.
  m.$transaction = vi.fn(async (fn: any) => fn(m));
  return { prismaMock: m };
});

vi.mock('../lib/prisma', () => ({ prisma: prismaMock }));

import { 
  createAppointment, 
  getAppointments, 
  getAppointmentById,
  updateAppointmentStatus,
  rescheduleAppointment 
} from './appointment.controller';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';

// The controller rejects bookings in the past, so tests must use dynamic future
// dates rather than hardcoded calendar dates (which rot into the past over time).
const futureISO = (daysAhead: number, hour: number, minute: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, minute, 0, 0);
  d.setMilliseconds(0);
  return d.toISOString();
};

describe('Appointment Controller', () => {
  let mockRequest: Partial<AuthRequest>;
  let mockResponse: Partial<Response>;
  let mockJson: ReturnType<typeof vi.fn>;
  let mockStatus: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockJson = vi.fn();
    mockStatus = vi.fn().mockReturnValue({ json: mockJson });
    
    mockRequest = {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        role: 'ADMIN' as any,
      },
      body: {},
      params: {},
      query: {},
    };

    mockResponse = {
      status: mockStatus,
      json: mockJson,
    };

    vi.clearAllMocks();
  });

  describe('createAppointment', () => {
    const validAppointmentData = {
      patientId: 'patient-123',
      doctorId: 'doctor-123',
      startTime: futureISO(7, 10, 0),
      endTime: futureISO(7, 10, 30),
      type: 'FIRST_VISIT',
      reason: 'Regular checkup',
    };

    it('should create appointment with valid data', async () => {
      // Arrange
      mockRequest.body = validAppointmentData;
      
      (prisma.staff.findUnique as Mock).mockResolvedValue({
        id: 'doctor-123',
        user: { firstName: 'John', lastName: 'Doe' }
      });
      
      (prisma.patient.findUnique as Mock).mockResolvedValue({
        id: 'patient-123',
        firstName: 'Jane',
        lastName: 'Smith'
      });
      
      (prisma.appointment.findFirst as Mock).mockResolvedValue(null);
      
      (prisma.appointment.create as Mock).mockResolvedValue({
        id: 'apt-123',
        ...validAppointmentData,
        status: AppointmentStatus.CONFIRMED,
      });

      // Act
      await createAppointment(mockRequest as AuthRequest, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(201);
      expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({
        id: 'apt-123',
      }));
    });

    it('should return 400 for missing patientId', async () => {
      // Arrange
      mockRequest.body = {
        doctorId: 'doctor-123',
        startTime: '2024-03-20T10:00:00Z',
        endTime: '2024-03-20T10:30:00Z',
        type: 'FIRST_VISIT',
      };

      // Act
      await createAppointment(mockRequest as AuthRequest, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ 
        message: 'Patient ID is required' 
      });
    });

    it('should return 404 if doctor not found', async () => {
      // Arrange
      mockRequest.body = validAppointmentData;
      
      (prisma.staff.findUnique as Mock).mockResolvedValue(null);

      // Act
      await createAppointment(mockRequest as AuthRequest, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({ 
        message: 'Doctor (Staff) not found' 
      });
    });

    it('should return 404 if patient not found', async () => {
      // Arrange
      mockRequest.body = validAppointmentData;
      
      (prisma.staff.findUnique as Mock).mockResolvedValue({
        id: 'doctor-123',
      });
      (prisma.patient.findUnique as Mock).mockResolvedValue(null);

      // Act
      await createAppointment(mockRequest as AuthRequest, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({ 
        message: 'Patient not found' 
      });
    });

    it('should return 409 for scheduling conflict', async () => {
      // Arrange
      mockRequest.body = validAppointmentData;
      
      (prisma.staff.findUnique as Mock).mockResolvedValue({
        id: 'doctor-123',
        user: { firstName: 'John', lastName: 'Doe' }
      });
      
      (prisma.patient.findUnique as Mock).mockResolvedValue({
        id: 'patient-123',
      });
      
      // Return existing appointment (conflict)
      (prisma.appointment.findFirst as Mock).mockResolvedValue({
        id: 'existing-apt',
      });

      // Act
      await createAppointment(mockRequest as AuthRequest, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(409);
      expect(mockJson).toHaveBeenCalledWith({ 
        message: 'Doctor is not available at this time' 
      });
    });

    it('should return 400 for invalid time range', async () => {
      // Arrange
      mockRequest.body = {
        ...validAppointmentData,
        startTime: futureISO(7, 10, 30),
        endTime: futureISO(7, 10, 0), // End before start (both in the future)
      };
      
      (prisma.staff.findUnique as Mock).mockResolvedValue({
        id: 'doctor-123',
      });
      (prisma.patient.findUnique as Mock).mockResolvedValue({
        id: 'patient-123',
      });

      // Act
      await createAppointment(mockRequest as AuthRequest, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ 
        message: 'Start time must be before end time' 
      });
    });
  });

  describe('getAppointments', () => {
    it('should return appointments for admin user', async () => {
      // Arrange
      mockRequest.query = {};
      
      const mockAppointments = [
        { id: 'apt-1', patientId: 'p1', doctorId: 'd1' },
        { id: 'apt-2', patientId: 'p2', doctorId: 'd2' },
      ];
      
      (prisma.appointment.findMany as Mock).mockResolvedValue(mockAppointments);

      // Act
      await getAppointments(mockRequest as AuthRequest, mockResponse as Response);

      // Assert — handler responds via res.json() (HTTP 200 is implicit)
      expect(mockJson).toHaveBeenCalledWith(mockAppointments);
    });

    it('should filter appointments by date', async () => {
      // Arrange
      mockRequest.query = { date: '2024-03-20' };
      
      (prisma.appointment.findMany as Mock).mockResolvedValue([]);

      // Act
      await getAppointments(mockRequest as AuthRequest, mockResponse as Response);

      // Assert
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            startTime: expect.objectContaining({
              gte: expect.any(Date),
              lte: expect.any(Date),
            }),
          }),
        })
      );
    });

    it('should filter by type when provided', async () => {
      // Arrange
      mockRequest.query = { type: 'FIRST_VISIT' };
      
      (prisma.appointment.findMany as Mock).mockResolvedValue([]);

      // Act
      await getAppointments(mockRequest as AuthRequest, mockResponse as Response);

      // Assert
      expect(prisma.appointment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: 'FIRST_VISIT',
          }),
        })
      );
    });
  });

  describe('getAppointmentById', () => {
    it('should return appointment by id', async () => {
      // Arrange
      mockRequest.params = { id: 'apt-123' };
      
      const mockAppointment = {
        id: 'apt-123',
        patient: { firstName: 'Jane', lastName: 'Smith' },
        doctor: { user: { firstName: 'John', lastName: 'Doe' } },
      };
      
      (prisma.appointment.findUnique as Mock).mockResolvedValue(mockAppointment);

      // Act
      await getAppointmentById(mockRequest as Request, mockResponse as Response);

      // Assert — handler responds via res.json() (HTTP 200 is implicit)
      expect(mockJson).toHaveBeenCalledWith(mockAppointment);
    });

    it('should return 404 if appointment not found', async () => {
      // Arrange
      mockRequest.params = { id: 'nonexistent' };
      
      (prisma.appointment.findUnique as Mock).mockResolvedValue(null);

      // Act
      await getAppointmentById(mockRequest as Request, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(404);
      expect(mockJson).toHaveBeenCalledWith({ 
        message: 'Appointment not found' 
      });
    });
  });

  describe('updateAppointmentStatus', () => {
    it('should update appointment status', async () => {
      // Arrange
      mockRequest.params = { id: 'apt-123' };
      mockRequest.body = { status: AppointmentStatus.CANCELLED };
      
      const mockAppointment = {
        id: 'apt-123',
        patientId: 'patient-123',
        status: AppointmentStatus.CONFIRMED,
      };
      
      (prisma.appointment.findUnique as Mock).mockResolvedValue(mockAppointment);
      (prisma.appointment.update as Mock).mockResolvedValue({
        ...mockAppointment,
        status: AppointmentStatus.CANCELLED,
      });

      // Act
      await updateAppointmentStatus(mockRequest as AuthRequest, mockResponse as Response);

      // Assert — handler responds via res.json() (HTTP 200 is implicit)
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({ status: AppointmentStatus.CANCELLED })
      );
    });

    it('should return 404 if appointment not found', async () => {
      // Arrange
      mockRequest.params = { id: 'nonexistent' };
      mockRequest.body = { status: AppointmentStatus.CANCELLED };
      
      (prisma.appointment.findUnique as Mock).mockResolvedValue(null);

      // Act
      await updateAppointmentStatus(mockRequest as AuthRequest, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(404);
    });

    it('should return 400 for invalid status', async () => {
      // Arrange
      mockRequest.params = { id: 'apt-123' };
      mockRequest.body = { status: 'INVALID_STATUS' };

      // Act
      await updateAppointmentStatus(mockRequest as AuthRequest, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ message: 'Invalid status' });
    });
  });

  describe('rescheduleAppointment', () => {
    it('should reschedule appointment successfully', async () => {
      // Arrange
      mockRequest.params = { id: 'apt-123' };
      mockRequest.body = {
        startTime: futureISO(8, 10, 0),
        endTime: futureISO(8, 10, 30),
      };

      const mockAppointment = {
        id: 'apt-123',
        doctorId: 'doctor-123',
        startTime: new Date(futureISO(7, 10, 0)),
        endTime: new Date(futureISO(7, 10, 30)),
      };

      (prisma.appointment.findUnique as Mock).mockResolvedValue(mockAppointment);
      (prisma.appointment.findFirst as Mock).mockResolvedValue(null); // No conflict
      (prisma.appointment.update as Mock).mockResolvedValue({
        ...mockAppointment,
        startTime: new Date(futureISO(8, 10, 0)),
        endTime: new Date(futureISO(8, 10, 30)),
      });

      // Act
      await rescheduleAppointment(mockRequest as AuthRequest, mockResponse as Response);

      // Assert — handler responds via res.json() (HTTP 200 is implicit)
      expect(mockJson).toHaveBeenCalled();
    });

    it('should return 400 if startTime or endTime missing', async () => {
      // Arrange
      mockRequest.params = { id: 'apt-123' };
      mockRequest.body = { startTime: '2024-03-21T10:00:00Z' }; // Missing endTime

      // Act
      await rescheduleAppointment(mockRequest as AuthRequest, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(400);
      expect(mockJson).toHaveBeenCalledWith({ 
        message: 'Start and End time are required' 
      });
    });

    it('should return 409 if new time has conflict', async () => {
      // Arrange
      mockRequest.params = { id: 'apt-123' };
      mockRequest.body = {
        startTime: futureISO(8, 10, 0),
        endTime: futureISO(8, 10, 30),
      };

      const mockAppointment = {
        id: 'apt-123',
        doctorId: 'doctor-123',
      };

      (prisma.appointment.findUnique as Mock).mockResolvedValue(mockAppointment);
      (prisma.appointment.findFirst as Mock).mockResolvedValue({
        id: 'conflicting-apt',
      });

      // Act
      await rescheduleAppointment(mockRequest as AuthRequest, mockResponse as Response);

      // Assert
      expect(mockStatus).toHaveBeenCalledWith(409);
      expect(mockJson).toHaveBeenCalledWith({ 
        message: 'Doctor is not available at this new time' 
      });
    });
  });
});
