import { Request, Response } from 'express';
import { PrismaClient, Role, Status, Gender } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { generatePatientId } from '../services/patient.service';
import { logAudit } from '../services/audit.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { sanitizeSearchQuery, sanitizeString } from '../utils/sanitization';
import { randomBytes } from 'crypto';

// Helper function to generate a secure random password
const generateSecurePassword = (): string => {
    const random = randomBytes(8).toString('hex');
    return `Oltra${random}@`;
};

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
    
    // Generate unique secure password (should be changed on first login)
    // In production, send a reset link instead.
    const tempPassword = generateSecurePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

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
    const search = sanitizeSearchQuery(req.query.search);

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
        include: { 
          user: { select: { email: true, status: true } },
          appointments: {
            orderBy: { appointmentDate: 'desc' },
            take: 1,
            select: { appointmentDate: true }
          },
          admissions: {
            orderBy: { admissionDate: 'desc' },
            take: 1,
            select: { admissionDate: true, dischargeDate: true }
          }
        }
      }),
      prisma.patient.count({ where: whereClause }),
    ]);

    // Transform data to include lastVisit
    const transformedPatients = patients.map(patient => {
      // Find the most recent date from appointments or admissions
      const lastAppointment = patient.appointments[0]?.appointmentDate;
      const lastAdmission = patient.admissions[0]?.admissionDate;
      
      let lastVisit = null;
      if (lastAppointment && lastAdmission) {
        lastVisit = new Date(lastAppointment) > new Date(lastAdmission) ? lastAppointment : lastAdmission;
      } else if (lastAppointment) {
        lastVisit = lastAppointment;
      } else if (lastAdmission) {
        lastVisit = lastAdmission;
      }

      const { appointments, admissions, ...rest } = patient as any;
      return {
        ...rest,
        lastVisit: lastVisit ? lastVisit.toISOString() : null
      };
    });

    res.json({
      data: transformedPatients,
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

export const getPatientById = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        if (!id) return res.status(400).json({ message: 'Patient ID is required' });

        const userRole = req.user?.role;
        const includeClinicalData = ['DOCTOR', 'NURSE', 'ADMIN', 'PATIENT'].includes(userRole as string);

        const patient = await prisma.patient.findUnique({
            where: { id: id as string },
            include: {
                user: { select: { email: true, status: true } },
                appointments: { take: 5, orderBy: { appointmentDate: 'desc' } },
                ...(includeClinicalData && { medicalRecords: { take: 5, orderBy: { visitDate: 'desc' } } }),
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

        // First check if patient record exists
        const existingPatient = await prisma.patient.findFirst({
            where: { userId }
        });

        if (!existingPatient) {
            return res.status(404).json({ message: 'Patient profile not found' });
        }

        // Perform updates in a transaction
        const result = await prisma.$transaction(async (tx) => {
            // 1. Update User Record
            const updatedUser = await tx.user.update({
                where: { id: userId },
                data: { firstName, lastName, email }
            });

            // 2. Update Patient Record using update (not updateMany) with the known ID
            await tx.patient.update({
                where: { id: existingPatient.id },
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

        // Fetch the updated patient to return complete data
        const updatedPatient = await prisma.patient.findUnique({
            where: { id: existingPatient.id }
        });

        res.json({ 
            message: 'Profile updated successfully', 
            user: result,
            patient: updatedPatient
        });

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

export const getMedicationSchedule = async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.id;
        if (!userId) return res.status(401).json({ message: 'Unauthorized' });

        const patient = await prisma.patient.findFirst({ where: { userId }, select: { id: true } });
        if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

        // Logic from getScheduledMedications
        const targetDate = new Date(); // Defaults to today
        const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
        const endOfDay = new Date(new Date().setHours(23, 59, 59, 999));

        const prescriptions = await prisma.prescription.findMany({
            where: {
                patientId: patient.id,
                status: { in: ['PENDING', 'DISPENSED', 'REFILL_REQUESTED'] }
            },
            include: {
                medicalRecord: { include: { doctor: { include: { user: true } } } }
            }
        });

        const administrations = await prisma.medicationAdministration.findMany({
             where: {
                patientId: patient.id,
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            },
            include: { administeredBy: { include: { user: true } } }
        });

        res.json({ prescriptions, administrations });

    } catch (error) {
        console.error("Medication Schedule Error:", error);
        res.status(500).json({ message: 'Failed to fetch medication schedule', error });
    }
};
