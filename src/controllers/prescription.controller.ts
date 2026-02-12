import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

export const getPrescriptions = async (req: AuthRequest, res: Response) => {
    try {
        const user = req.user;
        const { patientId } = req.query;
        
        const where: any = {};

        // Role Enforcement
        if (user?.role === 'PATIENT') {
            const patientProfile = await prisma.patient.findFirst({ where: { userId: user.id } });
            if (!patientProfile) return res.status(403).json({ message: 'Patient profile not found' });
            where.patientId = patientProfile.id;
        } else {
            // Doctors/Admins can filter
            if (patientId) where.patientId = String(patientId);
        }

        const prescriptions = await prisma.prescription.findMany({
            where,
            include: {
                medicalRecord: {
                    include: {
                        doctor: {
                            include: { user: { select: { firstName: true, lastName: true } } }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(prescriptions);
    } catch (error) {
        console.error("Error fetching prescriptions:", error);
        res.status(500).json({ message: 'Failed to fetch prescriptions' });
    }
};

export const getPrescriptionById = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const prescription = await prisma.prescription.findUnique({
            where: { id: String(id) },
            include: {
                medicalRecord: {
                    include: {
                        doctor: {
                            include: { user: { select: { firstName: true, lastName: true } } }
                        }
                    }
                },
                dispensing: true
            }
        });

        if (!prescription) return res.status(404).json({ message: 'Prescription not found' });

        // Security check for Patients: Can only view own
        if (req.user?.role === 'PATIENT') {
            const patientProfile = await prisma.patient.findFirst({ where: { userId: req.user.id } });
            if (prescription.patientId !== patientProfile?.id) {
                return res.status(403).json({ message: 'Access denied' });
            }
        }

        res.json(prescription);
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch prescription' });
    }
};

export const createPrescription = async (req: AuthRequest, res: Response) => {
    try {
        const { medicalRecordId, medicationName, dosage, frequency, route, duration, quantity } = req.body;
        // User (Doctor) ID is in req.user.id but seeded data links user to Staff
        
        // Ensure medical record exists
        const medicalRecord = await prisma.medicalRecord.findUnique({ 
            where: { id: medicalRecordId },
            include: { patient: true }
        });
        
        if (!medicalRecord) return res.status(404).json({ message: 'Medical Record not found' });

        const prescription = await prisma.prescription.create({
            data: {
                medicalRecordId,
                patientId: medicalRecord.patientId, 
                medicationName,
                dosage,
                frequency,
                route,
                duration,
                quantity,
                status: 'PENDING'
            }
        });
        res.status(201).json(prescription);
    } catch (error: any) {
        console.error("Create Prescription Error:", error);
        res.status(500).json({ message: 'Failed to create prescription', error: error.message });
    }
};

export const requestRefill = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const prescription = await prisma.prescription.findUnique({ where: { id: String(id) } });

        if (!prescription) return res.status(404).json({ message: 'Prescription not found' });

        // Authorization
        if (req.user?.role === 'PATIENT') {
            const patient = await prisma.patient.findFirst({ where: { userId: req.user.id } });
            if (prescription.patientId !== patient?.id) {
                return res.status(403).json({ message: 'Unauthorized' });
            }
        }

        const updated = await prisma.prescription.update({
            where: { id: String(id) },
            data: { status: 'REFILL_REQUESTED' }
        });

        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to request refill' });
    }
};
