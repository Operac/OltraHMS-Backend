import { Request, Response } from 'express';
import { PrismaClient, AppointmentStatus } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';

import { prisma } from '../lib/prisma';

// Modified to allow patientId to be optional if user is a PATIENT
const createAppointmentSchema = z.object({
  patientId: z.string().optional(), // Optional for patients
  moduleIdParam: z.string().optional(),
  doctorId: z.string(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  type: z.string().min(1),
  reason: z.string().optional(),
});

export const createAppointment = async (req: AuthRequest, res: Response) => {
  try {
    let { patientId, doctorId, startTime, endTime, type, reason } = createAppointmentSchema.parse(req.body);

    // If I am a patient, I can only book for myself
    if (req.user?.role === 'PATIENT') {
        const patientProfile = await prisma.patient.findFirst({ where: { userId: req.user.id } });
        if (!patientProfile) return res.status(403).json({ message: 'Patient profile not found' });
        
        // Force patientId to be my own
        patientId = patientProfile.id;
    }

    if (!patientId) return res.status(400).json({ message: 'Patient ID is required' });


    // Validate Doctor existence (Ensure it is a Staff record)
    // NOTE: Frontend usually sends Staff ID. If it sends User ID, we need to map it.
    // Let's assume frontend sends Staff ID for now.
    const doctorStaff = await prisma.staff.findUnique({ 
        where: { id: doctorId },
        include: { user: true }
    });

    if (!doctorStaff) return res.status(404).json({ message: 'Doctor (Staff) not found' });
    
    // Validate Patient existence
    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (start >= end) {
        return res.status(400).json({ message: 'Start time must be before end time' });
    }

    // Check for overlaps for this doctor
    const overlap = await prisma.appointment.findFirst({
        where: {
            doctorId, // Relates to Staff.id
            status: { not: AppointmentStatus.CANCELLED },
            OR: [
                { startTime: { lte: start }, endTime: { gt: start } },
                { startTime: { lt: end }, endTime: { gte: end } },
                { startTime: { gte: start }, endTime: { lte: end } }
            ]
        }
    });

    if (overlap) {
        return res.status(409).json({ message: 'Doctor is not available at this time' });
    }

    const appointment = await prisma.appointment.create({
        data: {
            patientId,
            doctorId,
            appointmentDate: start,
            startTime: start,
            endTime: end,
            type: type as any, // Only if matches enum, otherwise strictly: type as 'FIRST_VISIT' | 'FOLLOW_UP' | ...
            reason,
            // Auto-confirm if booked by staff, otherwise REQUESTED
            status: ['ADMIN', 'DOCTOR', 'RECEPTIONIST'].includes(req.user?.role || '') 
                ? AppointmentStatus.CONFIRMED 
                : AppointmentStatus.REQUESTED
        },
        include: {
            patient: { select: { firstName: true, lastName: true, patientNumber: true } },
            doctor: { 
                include: { 
                    user: { select: { firstName: true, lastName: true } } 
                } 
            }
        }
    });

    res.status(201).json(appointment);

  } catch (error) {
    if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Validation error', errors: error.issues });
    }
    console.error(error); // Log real error
    res.status(500).json({ message: 'Failed to create appointment', error });
  }
};

export const getAppointments = async (req: AuthRequest, res: Response) => {
    try {
        const { date, doctorId, patientId } = req.query;
        const user = req.user;

        const where: any = {};

        // Role-based security enforcement
        if (user?.role === 'PATIENT') {
            const patientProfile = await prisma.patient.findFirst({ where: { userId: user.id } });
            if (!patientProfile) return res.status(403).json({ message: 'Patient profile not found' });
            where.patientId = patientProfile.id;
        } else if (user?.role === 'DOCTOR') {
            const staffProfile = await prisma.staff.findFirst({ where: { userId: user.id } });
            if (!staffProfile) return res.status(403).json({ message: 'Staff profile not found' });
            where.doctorId = staffProfile.id;
        } else {
            // Admin/Receptionist can filter freely
            if (doctorId) where.doctorId = String(doctorId);
            if (patientId) where.patientId = String(patientId);
        }
        
        if (date) {
            const startDate = new Date(String(date));
            const endDate = new Date(startDate);
            endDate.setHours(23, 59, 59, 999);
            where.startTime = { gte: startDate, lte: endDate };
        }

        const appointments = await prisma.appointment.findMany({
            where,
            include: {
                patient: { select: { firstName: true, lastName: true, patientNumber: true } },
                doctor: { 
                    include: { 
                        user: { select: { firstName: true, lastName: true } } 
                    } 
                }
            },
            orderBy: { startTime: 'asc' }
        });

        res.json(appointments);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to fetch appointments', error });
    }
};

export const getAppointmentById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const appointment = await prisma.appointment.findUnique({
            where: { id: String(id) },
            include: {
                patient: { 
                    select: { 
                        id: true, 
                        firstName: true, 
                        lastName: true, 
                        gender: true, 
                        dateOfBirth: true
                    } 
                },
                doctor: { include: { user: true } }
            }
        });

        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
        res.json(appointment);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch appointment', error });
    }
};

export const updateAppointmentStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const userId = req.user?.id;

        // Type guard using explicit cast or Object.values check
        if (!Object.values(AppointmentStatus).includes(status as AppointmentStatus)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const appointment = await prisma.appointment.findUnique({ where: { id: String(id) } });

        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        // Patient authorization check
        if (req.user?.role === 'PATIENT') {
            const patient = await prisma.patient.findFirst({ where: { userId } });
            if (!patient || appointment.patientId !== patient.id) {
                return res.status(403).json({ message: 'Unauthorized to modifying this appointment' });
            }
            // Patients can only Cancel
            if (status !== AppointmentStatus.CANCELLED) {
                return res.status(403).json({ message: 'Patients can only cancel appointments' });
            }
        }

        const updated = await prisma.appointment.update({
            where: { id: String(id) },
            data: { status: status as AppointmentStatus }
        });

        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update appointment', error });
    }
};

export const rescheduleAppointment = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { startTime, endTime } = req.body;
        const userId = req.user?.id;

        if (!startTime || !endTime) {
            return res.status(400).json({ message: 'Start and End time are required' });
        }

        const appointment = await prisma.appointment.findUnique({ where: { id: String(id) } });
        if (!appointment) return res.status(404).json({ message: 'Appointment not found' });

        // Authorization check
        if (req.user?.role === 'PATIENT') {
            const patient = await prisma.patient.findFirst({ where: { userId } });
            if (!patient || appointment.patientId !== patient.id) {
                return res.status(403).json({ message: 'Unauthorized' });
            }
        }

        const start = new Date(startTime);
        const end = new Date(endTime);

        if (start >= end) return res.status(400).json({ message: 'Invalid time range' });

        // Check availability (overlap)
        const overlap = await prisma.appointment.findFirst({
            where: {
                doctorId: appointment.doctorId,
                id: { not: appointment.id }, // Exclude current
                status: { not: AppointmentStatus.CANCELLED },
                OR: [
                    { startTime: { lte: start }, endTime: { gt: start } },
                    { startTime: { lt: end }, endTime: { gte: end } },
                    { startTime: { gte: start }, endTime: { lte: end } }
                ]
            }
        });

        if (overlap) {
            return res.status(409).json({ message: 'Doctor is not available at this new time' });
        }

        const updatedAppointment = await prisma.appointment.update({
            where: { id: String(id) },
            data: {
                startTime: start,
                endTime: end,
                appointmentDate: start,
                // Reset status to REQUESTED if rescheduled by patient, or CONFIRMED if by doctor?
                // For simplicity, let's keep it CONFIRMED if it was confirmed, or REQUESTED if not.
                // Or maybe safer to reset to REQUESTED if patient changes it.
                status: req.user?.role === 'PATIENT' ? AppointmentStatus.REQUESTED : AppointmentStatus.CONFIRMED
            }
        });

        res.json(updatedAppointment);

    } catch (error) {
        console.error('Reschedule Error:', error);
        res.status(500).json({ message: 'Failed to reschedule appointment' });
    }
};
