
import { Request, Response } from 'express';
import { PrismaClient, Role, AppointmentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// --- Appointments ---

export const getDailyAppointments = async (req: Request, res: Response) => {
    try {
        const { date, status, doctorId } = req.query;
        
        const startOfDay = date ? new Date(date as string) : new Date();
        startOfDay.setHours(0, 0, 0, 0);
        
        const endOfDay = new Date(startOfDay);
        endOfDay.setHours(23, 59, 59, 999);

        const whereClause: any = {
            startTime: {
                gte: startOfDay,
                lte: endOfDay
            }
        };

        if (status) whereClause.status = status;
        if (doctorId) whereClause.doctorId = doctorId;

        const appointments = await prisma.appointment.findMany({
            where: whereClause,
            include: {
                patient: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        phone: true,
                        patientNumber: true
                    }
                },
                doctor: {
                    include: {
                        user: {
                            select: {
                                firstName: true,
                                lastName: true
                            }
                        }
                    }
                }
            },
            orderBy: { startTime: 'asc' }
        });

        res.json(appointments);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to fetch appointments' });
    }
};

export const checkInPatient = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        
        await prisma.appointment.update({
            where: { id: id as string },
            data: { status: AppointmentStatus.CHECKED_IN }
        });

        res.json({ message: 'Patient checked in successfully' });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to check in patient' });
    }
};

export const markNoShow = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        
        await prisma.appointment.update({
            where: { id: id as string },
            data: { status: AppointmentStatus.NO_SHOW }
        });

        res.json({ message: 'Appointment marked as No Show' });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to mark as No Show' });
    }
};

export const bookAppointment = async (req: Request, res: Response) => {
    try {
        const { patientId, doctorId, startTime, type, notes } = req.body;

        // Validations
        const start = new Date(startTime);
        const end = new Date(start.getTime() + 30 * 60000); // Default 30 min duration

        // Check availability
        const conflict = await prisma.appointment.findFirst({
            where: {
                doctorId,
                startTime: { lt: end },
                endTime: { gt: start },
                status: { not: 'CANCELLED' }
            }
        });

        if (conflict) {
            return res.status(409).json({ message: 'Doctor is not available at this time' });
        }

        const appointment = await prisma.appointment.create({
            data: {
                patientId,
                doctorId,
                appointmentDate: start, // Required field
                startTime: start,
                endTime: end,
                type: (type as any) || 'FIRST_VISIT', // Cast to any to avoid TS error if string
                status: AppointmentStatus.CONFIRMED,
                notes
            }
        });

        res.status(201).json(appointment);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to book appointment' });
    }
};

// --- Patient Management ---

export const searchPatients = async (req: Request, res: Response) => {
    try {
        const { query } = req.query;
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ message: 'Search query required' });
        }

        const patients = await prisma.patient.findMany({
            where: {
                OR: [
                    { firstName: { contains: query, mode: 'insensitive' } },
                    { lastName: { contains: query, mode: 'insensitive' } },
                    { phone: { contains: query } },
                    { patientNumber: { contains: query, mode: 'insensitive' } }
                ]
            },
            take: 10
        });

        res.json(patients);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to search patients' });
    }
};

export const registerPatient = async (req: Request, res: Response) => {
    try {
        const { firstName, lastName, email, phone, dateOfBirth, gender, address } = req.body;

        // 1. Create User/Account
        // If email is provided, check existence. If not, generate dummy or fail?
        // Assuming email is optional in frontend form? Schema requires unique user.
        // We will generate a placeholder email if not provided: patientNUMBER@oltra.local
        
        let userEmail = email;
        if (!userEmail) {
           userEmail = `patient${Date.now()}@oltra.local`;
        }

        const existingUser = await prisma.user.findUnique({ where: { email: userEmail } });
        if (existingUser) return res.status(400).json({ message: 'Email already registered' });

        const hashedPassword = await bcrypt.hash('Oltra123!', 10);
        const user = await prisma.user.create({
            data: {
                email: userEmail,
                passwordHash: hashedPassword, // Correct field
                role: Role.PATIENT, // Correct enum
                firstName,
                lastName
            }
        });
        
        const userId = user.id;

        // 2. Create Patient Profile
        const patientNumber = `P${Date.now().toString().slice(-6)}`;
        const patient = await prisma.patient.create({
            data: {
                userId, // Required
                firstName,
                lastName,
                // email: email, // REMOVED: Not in Patient model
                phone,
                dateOfBirth: new Date(dateOfBirth),
                gender,
                address,
                patientNumber
            }
        });

        res.status(201).json({ message: 'Patient registered successfully', patient });
    } catch (error: any) {
        console.error("Register Patient Error:", error);
        res.status(500).json({ message: error.message || 'Failed to register patient' });
    }
};

// --- Utils ---

export const listDoctors = async (req: Request, res: Response) => {
    try {
        const doctors = await prisma.staff.findMany({
            where: {
                user: { role: Role.DOCTOR }
            },
            include: {
                user: {
                    select: {
                        firstName: true,
                        lastName: true
                    }
                }
            }
        });

        const mapped = doctors.map((d: any) => ({
            id: d.id,
            name: `Dr. ${d.user.firstName} ${d.user.lastName}`,
            specialization: d.specialization || 'General'
        }));
        
        res.json(mapped);
    } catch (error: any) {
         res.status(500).json({ message: 'Failed to fetch doctors' });
    }
};
