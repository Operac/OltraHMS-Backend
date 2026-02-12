import { Request, Response } from 'express';
import { PrismaClient, MedicationRoute, DosageForm } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth.middleware';

import { prisma } from '../lib/prisma';

const medicalRecordSchema = z.object({
  appointmentId: z.string().optional(),
  patientId: z.string(),
  doctorId: z.string(),
  soap: z.object({
    subjective: z.string(),
    objective: z.string(),
    assessment: z.string(),
    plan: z.string()
  }),
  vitals: z.any().optional(), 
  prescriptions: z.array(z.any()).optional(),
  labOrders: z.array(z.any()).optional(),
  status: z.enum(['DRAFT', 'COMPLETED']).optional()
});

export const createMedicalRecord = async (req: AuthRequest, res: Response) => {
  try {
    // 1. Resolve Doctor ID
    let doctorId = req.body.doctorId;
    
    if (!doctorId && req.user) {
        const staff = await prisma.staff.findUnique({ where: { userId: req.user.id } });
        if (staff) doctorId = staff.id;
    }

    if (!doctorId) {
        return res.status(400).json({ message: 'Doctor ID is required and could not be resolved.' });
    }

    // 2. Validate Body (doctorId is now handled, we can mock it in body for validation if schema requires it, or update schema)
    // Let's update schema to make doctorId optional there, or fill it before parse.
    const payload = { ...req.body, doctorId }; 
    const data = medicalRecordSchema.parse(payload);

    // 3. Upsert Logic (Create or Update)
    const recordData = {
        patientId: data.patientId,
        doctorId: doctorId,
        subjective: data.soap.subjective,
        objective: data.soap.objective,
        assessment: data.soap.assessment,
        plan: data.soap.plan,
        visitDate: new Date(),
    };

    const relationsData = {
        prescriptions: data.prescriptions && data.prescriptions.length > 0 ? {
             create: data.prescriptions.map((rx: any) => ({
                 medicationName: rx.name,
                 dosage: rx.dosage,
                 frequency: rx.frequency,
                 duration: parseInt(rx.duration) || 5,
                 quantity: 10,
                 route: MedicationRoute.ORAL,
                 patient: { connect: { id: data.patientId } }
             }))
        } : undefined,

        labOrders: data.labOrders && data.labOrders.length > 0 ? {
             create: data.labOrders.map((lab: any) => ({
                 testName: lab.test,
                 priority: lab.priority || 'ROUTINE',
                 patient: { connect: { id: data.patientId } }
             }))
        } : undefined,
    };

    // If appointmentId exists, we can upsert. if not, we must create (and uniqueness isn't guaranteed by appointmentId)
    let record;
    if (data.appointmentId) {
        record = await prisma.medicalRecord.upsert({
            where: { appointmentId: data.appointmentId },
            create: {
                ...recordData,
                appointmentId: data.appointmentId,
                ...relationsData
            },
            update: {
                ...recordData,
                // For updates, we clear old relations and re-create to match current form state
                // This mimics "saving the form"
                prescriptions: {
                    deleteMany: {},
                    ...relationsData.prescriptions
                },
                labOrders: {
                    deleteMany: {},
                    ...relationsData.labOrders
                }
            }
        });
    } else {
        record = await prisma.medicalRecord.create({
            data: {
                ...recordData,
                appointmentId: data.appointmentId, // undefined
                ...relationsData
            }
        });
    }

    if (data.vitals) {
        // Optional: Create Vitals record
        // await prisma.vitalSigns.create({ ... })
    }

    res.status(201).json(record);
// ... createMedicalRecord existing code ...
  } catch (error: any) {
    console.error(error);
    const fs = require('fs');
    fs.writeFileSync('error.log', JSON.stringify(error, null, 2) + '\n' + error.stack);
    res.status(500).json({ message: 'Failed to create medical record', error: error.message });
  }
};

export const getMedicalRecords = async (req: AuthRequest, res: Response) => {
  try {
    const { patientId, doctorId } = req.query;
    const user = req.user;
    
    // Build filter based on query (and role permissions ideally)
    const where: any = {};

    // Role Enforcement
    if (user?.role === 'PATIENT') {
        const patientProfile = await prisma.patient.findFirst({ where: { userId: user.id } });
        if (!patientProfile) return res.status(403).json({ message: 'Patient profile not found' });
        // STRICTLY enforce ONLY this patient's records
        where.patientId = patientProfile.id;
    } else {
        // Doctors/Admins can filter
        if (patientId) where.patientId = String(patientId);
        if (doctorId) where.doctorId = String(doctorId);
    }
    
    // If doctor is logged in, they might want to see only their records or all?
    // For now, let's allow filtering.
    
    const records = await prisma.medicalRecord.findMany({
      where,
      include: {
        patient: { select: { firstName: true, lastName: true, gender: true, dateOfBirth: true } },
        doctor: { select: { user: { select: { firstName: true, lastName: true } } } }
      },
      orderBy: { visitDate: 'desc' }
    });

    res.json(records);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch records', error });
  }
};

const PDFDocument = require('pdfkit');

export const getMedicalRecordById = async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const record = await prisma.medicalRecord.findUnique({
      where: { id },
      include: {
        patient: true,
        doctor: { include: { user: true } },
        prescriptions: true,
        labOrders: true,
        appointment: true
      }
    });

    if (!record) return res.status(404).json({ message: 'Record not found' });
    res.json(record);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to fetch record', error });
  }
};

export const downloadMedicalRecordPDF = async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const record = await prisma.medicalRecord.findUnique({
            where: { id },
            include: {
                patient: true,
                doctor: { include: { user: true } },
                prescriptions: true,
                labOrders: true
            }
        });

        if (!record) return res.status(404).json({ message: 'Record not found' });
        
        const data: any = record;

        const doc = new PDFDocument();

        // Stream response
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=medical_record_${data.id}.pdf`);
        
        doc.pipe(res);

        // Header
        doc.fontSize(20).text('OltraHMS - Medical Record', { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Date: ${data.visitDate.toDateString()}`);
        doc.text(`Patient: ${data.patient.firstName} ${data.patient.lastName}`);
        doc.text(`Doctor: Dr. ${data.doctor.user.lastName}`);
        doc.moveDown();

        // SOAP Notes
        doc.fontSize(14).text('SOAP Notes', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(12).text(`Subjective: ${data.subjective}`);
        doc.text(`Objective: ${data.objective}`);
        doc.text(`Assessment: ${data.assessment}`);
        doc.text(`Plan: ${data.plan}`);
        doc.moveDown();

        // Prescriptions
        if (data.prescriptions && data.prescriptions.length > 0) {
            doc.fontSize(14).text('Prescriptions', { underline: true });
            doc.moveDown(0.5);
            data.prescriptions.forEach((rx: any) => {
                doc.fontSize(12).text(`- ${rx.medicationName} (${rx.dosage}, ${rx.frequency})`);
            });
            doc.moveDown();
        }

        // Lab Orders
        if (data.labOrders && data.labOrders.length > 0) {
             doc.fontSize(14).text('Lab Orders', { underline: true });
             doc.moveDown(0.5);
             data.labOrders.forEach((lab: any) => {
                 doc.fontSize(12).text(`- ${lab.testName} (${lab.priority})`);
             });
        }

        doc.end();

    } catch (error) {
        console.error('PDF Gen Error:', error);
        res.status(500).json({ message: 'Failed to generate PDF' });
    }
};
