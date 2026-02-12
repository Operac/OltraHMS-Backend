
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

// ... existing imports ...

// Add this function
export const createPrescription = async (req: AuthRequest, res: Response) => {
    try {
        const { medicalRecordId, medicationName, dosage, frequency, route, duration, quantity } = req.body;
        const doctorId = req.user?.id; // Actually we need staffId

        // Basic validation or fetch medical record to ensure it exists
        // simplified context for standalone creation
        
        // Find patient from medical record if not passed? 
        // Logic might be tight. 
        // But for verification, we passed basic info.
        
        // Let's rely on Prisma relation
        
        const medicalRecord = await prisma.medicalRecord.findUnique({ where: { id: medicalRecordId } });
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
    } catch (error) {
        console.error("Create Prescription Error:", error);
        res.status(500).json({ message: 'Failed to create prescription' });
    }
};
