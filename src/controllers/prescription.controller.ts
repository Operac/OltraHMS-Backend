import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

const PDFDocument = require('pdfkit');

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

        // PRE-PAYMENT GATE: Verify payment cleared before issuing new prescriptions
        const unpaidInvoices = await prisma.invoice.findMany({
            where: { patientId: medicalRecord.patientId, balance: { gt: 0 } },
            take: 1
        });
        if (unpaidInvoices.length > 0) {
            return res.status(402).json({
                message: `Payment required before issuing prescriptions. Outstanding balance: ₦${unpaidInvoices[0].balance.toLocaleString()}`,
                requiredPayment: unpaidInvoices[0].balance
            });
        }

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

/**
 * Download Prescription as PDF
 */
export const downloadPrescriptionPDF = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        
        const prescription = await prisma.prescription.findUnique({
            where: { id: String(id) },
            include: {
                medicalRecord: {
                    include: {
                        patient: true,
                        doctor: {
                            include: { user: true }
                        }
                    }
                },
                dispensing: true
            }
        });

        if (!prescription) {
            return res.status(404).json({ message: 'Prescription not found' });
        }

        // Security check for Patients
        if (req.user?.role === 'PATIENT') {
            const patientProfile = await prisma.patient.findFirst({ where: { userId: req.user.id } });
            if (prescription.patientId !== patientProfile?.id) {
                return res.status(403).json({ message: 'Access denied' });
            }
        }

        const doc = new PDFDocument();
        
        // Stream response
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=prescription_${id}.pdf`);
        
        doc.pipe(res);

        // Header
        doc.fontSize(20).text('OltraHMS - Prescription', { align: 'center' });
        doc.moveDown();
        
        // Hospital Info
        doc.fontSize(10).text('OltraHMS Hospital Management System', { align: 'center' });
        doc.text('123 Healthcare Ave, Medical City', { align: 'center' });
        doc.text('Phone: +1-234-567-8900', { align: 'center' });
        doc.moveDown();
        
        // Divider
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();
        
        // Patient Info
        doc.fontSize(12);
        doc.text(`Date: ${new Date().toLocaleDateString()}`);
        doc.text(`Prescription #: ${prescription.id.slice(0, 8).toUpperCase()}`);
        doc.moveDown();
        
        // Patient Details Box
        doc.fontSize(11);
        doc.text('PATIENT INFORMATION', { underline: true });
        doc.text(`Name: ${prescription.medicalRecord.patient.firstName} ${prescription.medicalRecord.patient.lastName}`);
        doc.text(`Patient #: ${prescription.medicalRecord.patient.patientNumber}`);
        doc.text(`Age: ${prescription.medicalRecord.patient.dateOfBirth ? calculateAge(prescription.medicalRecord.patient.dateOfBirth) : 'N/A'}`);
        doc.text(`Gender: ${prescription.medicalRecord.patient.gender}`);
        doc.moveDown();
        
        // Doctor Details
        doc.text('PRESCRIBING DOCTOR', { underline: true });
        doc.text(`Dr. ${prescription.medicalRecord.doctor.user.firstName} ${prescription.medicalRecord.doctor.user.lastName}`);
        doc.text(`Specialization: ${prescription.medicalRecord.doctor.specialization}`);
        doc.text(`License #: ${prescription.medicalRecord.doctor.staffNumber}`);
        doc.moveDown();
        
        // Divider
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();
        
        // Prescription Details
        doc.fontSize(14).text('PRESCRIPTION', { underline: true });
        doc.moveDown();
        
        // Rx Symbol
        doc.fontSize(24).text('℞ ', { continued: true });
        doc.fontSize(14).text(prescription.medicationName);
        doc.moveDown(0.5);
        
        // Prescription details in a box
        doc.fontSize(12);
        doc.text(`Dosage: ${prescription.dosage}`);
        doc.text(`Frequency: ${prescription.frequency}`);
        doc.text(`Duration: ${prescription.duration} days`);
        doc.text(`Quantity: ${prescription.quantity}`);
        doc.text(`Route: ${prescription.route}`);
        doc.moveDown();
        
        // Instructions
        doc.fontSize(11).text('Instructions: Take as directed. Complete full course of medication.', { italic: true });
        doc.moveDown();
        
        // Warnings
        doc.fontSize(10).fillColor('red');
        doc.text('WARNING: This prescription is valid for 30 days from the date of issue.');
        doc.fillColor('black');
        doc.moveDown();
        
        // Divider
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();
        
        // Footer
        doc.fontSize(9);
        doc.text('This is a computer-generated prescription. No signature required.', { align: 'center' });
        doc.text(`Generated on: ${new Date().toLocaleString()}`, { align: 'center' });
        doc.text('OltraHMS - Healthcare Made Simple', { align: 'center' });
        
        doc.end();
    } catch (error) {
        console.error('Prescription PDF Error:', error);
        res.status(500).json({ message: 'Failed to generate prescription PDF' });
    }
};

// Helper function to calculate age
function calculateAge(dateOfBirth: Date): string {
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
    }
    return age.toString();
}
