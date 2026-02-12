import { Request, Response } from 'express';
import { PrismaClient, Role, Status, Gender } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { generatePatientId } from '../services/patient.service';
import { logAudit } from '../services/audit.service';
import { AuthRequest } from '../middleware/auth.middleware';

import { prisma } from '../lib/prisma';

// Validation Schema
const createPatientSchema = z.object({
  firstName: z.string().min(2),
  lastName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(10),
  dateOfBirth: z.string().or(z.date()), // Accept string from JSON
  gender: z.nativeEnum(Gender),
  bloodGroup: z.string().optional(), // Make optional for registration
  genotype: z.string().optional(),
  address: z.string(),
  emergencyContact: z.any().optional(), // JSON
});

export const createPatient = async (req: AuthRequest, res: Response) => {
  try {
    const data = createPatientSchema.parse(req.body);
    
    // Check for existing user email or phone
    const existingEmail = await prisma.user.findUnique({ where: { email: data.email } });
    if (existingEmail) return res.status(400).json({ message: 'Email already in use' });

    const existingPhone = await prisma.patient.findFirst({ where: { phone: data.phone } });
    if (existingPhone) return res.status(400).json({ message: 'Phone number already registered' });

    // Generate ID
    const patientNumber = await generatePatientId();
    
    // Default password for new patients (should be changed on first login)
    // In production, send a reset link instead.
    const hashedPassword = await bcrypt.hash('OltraHMS@123', 12);

    // Transaction: Create User + Patient
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create User
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash: hashedPassword,
          firstName: data.firstName,
          lastName: data.lastName,
          role: Role.PATIENT,
          status: Status.ACTIVE,
        },
      });

      // 2. Create Patient
      const patient = await tx.patient.create({
        data: {
          userId: user.id,
          patientNumber,
          firstName: data.firstName,
          lastName: data.lastName,
          dateOfBirth: new Date(data.dateOfBirth),
          gender: data.gender,
          phone: data.phone,
          address: data.address,
          emergencyContact: data.emergencyContact || {},
          // Optional fields
          ...(data.bloodGroup && { bloodGroup: data.bloodGroup as any }),
          ...(data.genotype && { genotype: data.genotype as any }),
        },
      });

      return patient;
    });

    await logAudit(req.user?.id || 'SYSTEM', 'CREATE_PATIENT', `Created patient ${result.patientNumber}`, req.ip || 'unknown');

    res.status(201).json({ message: 'Patient registered successfully', patient: result });

  } catch (error) {
    console.error('Create Patient Error:', error);
    res.status(500).json({ message: 'Failed to create patient', error });
  }
};

export const getPatients = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;

    const skip = (page - 1) * limit;

    const whereClause: any = {};
    
    if (req.query.doctorId) {
      whereClause.appointments = {
        some: {
          doctorId: String(req.query.doctorId) // Filter by Staff ID
        }
      };
    }

    if (search) {
      whereClause.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { patientNumber: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    const [patients, total] = await Promise.all([
      prisma.patient.findMany({
        where: whereClause,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { email: true, status: true } } }
      }),
      prisma.patient.count({ where: whereClause }),
    ]);

    res.json({
      data: patients,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch patients' });
  }
};

export const getPatientById = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ message: 'Patient ID is required' });

        const patient = await prisma.patient.findUnique({
            where: { id: id as string },
            include: {
                user: { select: { email: true, status: true } },
                appointments: { take: 5, orderBy: { appointmentDate: 'desc' } },
                medicalRecords: { take: 5, orderBy: { visitDate: 'desc' } },
            }
        });

        if (!patient) return res.status(404).json({ message: 'Patient not found' });

        res.json(patient);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch patient details' });
    }
};

export const getDashboardStats = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const patient = await prisma.patient.findFirst({
            where: { userId },
            include: {
                appointments: {
                    where: {
                        startTime: { gte: new Date() },
                        status: { not: 'CANCELLED' }
                    },
                    orderBy: { startTime: 'asc' },
                    take: 1,
                    include: { doctor: { include: { user: true } } }
                },
                medicalRecords: {
                    take: 5,
                    orderBy: { visitDate: 'desc' }
                }
            }
        });

        if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

        // Calculate Outstanding Balance
        const openInvoices = await prisma.invoice.findMany({
            where: {
                patientId: patient.id,
                status: { in: ['ISSUED', 'PARTIAL'] }
            }
        });
        const outstandingBalance = openInvoices.reduce((acc, curr) => acc + curr.balance, 0);

        // Fetch Latest Vitals
        const latestVitals = await prisma.vitalSigns.findFirst({
            where: { patientId: patient.id },
            orderBy: { recordedAt: 'desc' }
        });

        const nextAppointment = patient.appointments[0];
        
        const stats = {
            patientName: `${patient.firstName} ${patient.lastName}`,
            nextAppointment: nextAppointment ? {
                id: nextAppointment.id,
                doctorName: `Dr. ${nextAppointment.doctor.user.lastName}`,
                specialization: nextAppointment.doctor.specialization,
                date: nextAppointment.startTime,
                type: nextAppointment.type
            } : null,
            activeMedications: await prisma.prescription.count({
                where: {
                    patientId: patient.id,
                    status: { in: ['PENDING', 'DISPENSED'] }
                }
            }),
            outstandingBalance,
            vitals: latestVitals ? {
                heartRate: latestVitals.heartRate,
                bp: `${latestVitals.bpSystolic}/${latestVitals.bpDiastolic}`,
                temperature: latestVitals.temperature,
                weight: latestVitals.weight,
                lastRecorded: latestVitals.recordedAt
            } : null,
            recentActivity: patient.medicalRecords.map(record => ({
                id: record.id,
                date: record.visitDate,
                diagnosis: (record.assessment as any)?.primaryDiagnosis || 'Check Record',
                doctorName: 'Doctor' 
            })),
            isProfileComplete: !!patient.phone // Check if key fields like phone are present
        };

        res.json(stats);
    } catch (error) {
        console.error('Dashboard Stats Error:', error);
        res.status(500).json({ message: 'Failed to fetch dashboard stats' });
    }
};

export const updatePatientProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const { 
            firstName, lastName, email, phone, 
            address, bloodGroup, genotype, emergencyContact 
        } = req.body;

        // Perform updates in a transaction
        const result = await prisma.$transaction(async (tx) => {
            // 1. Update User Record
            const updatedUser = await tx.user.update({
                where: { id: userId },
                data: { firstName, lastName, email }
            });

            // 2. Update Patient Record
            // using findFirst to get ID then update could be safer but updateMany by userId works if 1:1
            await tx.patient.updateMany({
                where: { userId },
                data: {
                    firstName, 
                    lastName,
                    phone,
                    address,
                    bloodGroup,
                    genotype,
                    emergencyContact
                }
            });

            return updatedUser;
        });

        res.json({ message: 'Profile updated successfully', user: result });

    } catch (error) {
        console.error("Update Profile Error:", error);
        res.status(500).json({ message: 'Failed to update profile' });
    }
};

export const getPatientProfile = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        const patient = await prisma.patient.findFirst({
            where: { userId },
            include: { user: { select: { email: true } } }
        });
        
        if (!patient) return res.status(404).json({ message: 'Profile not found' });
        
        res.json({ ...patient, email: patient.user?.email });
    } catch (error) {
         res.status(500).json({ message: 'Failed to fetch profile' });
    }
};
