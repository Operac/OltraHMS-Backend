import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppointmentStatus, PrescriptionStatus, LabStatus, InvoiceStatus, LabPriority } from '@prisma/client';

// Helper to get doctor context
const getDoctorContext = async (userId: string) => {
    const staff = await prisma.staff.findUnique({ where: { userId } });
    if (!staff) throw new Error('Doctor profile not found');
    return staff;
};

// --- Dashboard & Queue ---

export const getDoctorDashboardStats = async (req: AuthRequest, res: Response) => {
    try {
        const doctor = await getDoctorContext(req.user!.id);
        const today = new Date();
        const startOfDay = new Date(today.setHours(0,0,0,0));
        const endOfDay = new Date(today.setHours(23,59,59,999));

        const appointments = await prisma.appointment.findMany({
            where: {
                doctorId: doctor.id,
                startTime: { gte: startOfDay, lte: endOfDay }
            },
            include: { patient: { select: { firstName: true, lastName: true, patientNumber: true } } },
            orderBy: { startTime: 'asc' }
        });

        const stats = {
            totalToday: appointments.length,
            waiting: appointments.filter(a => ['CONFIRMED', 'CHECKED_IN'].includes(a.status)).length,
            inProgress: appointments.filter(a => a.status === 'IN_PROGRESS').length,
            completed: appointments.filter(a => a.status === 'COMPLETED').length,
            nextPatient: appointments.find(a => ['CONFIRMED', 'CHECKED_IN'].includes(a.status)) || null
        };

        res.json({ stats, appointments });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to fetch dashboard stats' });
    }
};

export const updateAppointmentStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // IN_PROGRESS, COMPLETED, NO_SHOW

        const appointment = await prisma.appointment.update({
            where: { id: id as string },
            data: { status }
        });

        res.json(appointment);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to update status' });
    }
};

export const getAssignedPatients = async (req: AuthRequest, res: Response) => {
    try {
        const doctor = await getDoctorContext(req.user!.id);
        
        // Find distinct patients from appointments (or just all unique patients)
        // Using distinct on patientId
        const appointments = await prisma.appointment.findMany({
            where: { doctorId: doctor.id },
            select: { 
                patient: true,
                patientId: true
            },
            distinct: ['patientId']
        });
        
        res.json(appointments);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to fetch patients' });
    }
};

// --- Patient History ---

export const getPatientMedicalHistory = async (req: AuthRequest, res: Response) => {
    try {
        const { patientId } = req.params;

        const patient = await prisma.patient.findUnique({
            where: { id: patientId as string },
            include: {
                medicalRecords: {
                    include: {
                        doctor: { include: { user: { select: { firstName: true, lastName: true } } } },
                        prescriptions: true,
                        labOrders: { include: { result: true } }
                    },
                    orderBy: { visitDate: 'desc' },
                    take: 10 // Last 10 visits
                }
            }
        });

        if (!patient) return res.status(404).json({ message: 'Patient not found' });

        res.json({
            profile: {
                firstName: patient.firstName,
                lastName: patient.lastName,
                dob: patient.dateOfBirth,
                gender: patient.gender,
                bloodGroup: patient.bloodGroup,
                genotype: patient.genotype,
                allergies: patient.allergies,
                conditions: patient.chronicConditions
            },
            history: patient.medicalRecords
        });
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to fetch history' });
    }
};

// --- Consultation Actions ---

export const saveConsultation = async (req: AuthRequest, res: Response) => {
    try {
        const doctor = await getDoctorContext(req.user!.id);
        const { 
            appointmentId, 
            patientId, 
            soap, // { subjective, objective, assessment, plan }
            prescriptions, // Array of { medicationName, dosage, frequency, duration, quantity }
            labOrders, // Array of { testName, priority, indication }
            billingItems // Optional: Array of { description, amount }
        } = req.body;

        // 1. Create Medical Record
        const record = await prisma.medicalRecord.create({
            data: {
                patientId,
                doctorId: doctor.id,
                appointmentId,
                visitDate: new Date(),
                subjective: soap.subjective,
                objective: soap.objective,
                assessment: soap.assessment,
                plan: soap.plan
            }
        });

        // 2. Create Prescriptions
        if (prescriptions && prescriptions.length > 0) {
            await prisma.prescription.createMany({
                data: prescriptions.map((p: any) => ({
                    medicalRecordId: record.id,
                    patientId,
                    medicationName: p.medicationName,
                    dosage: p.dosage,
                    frequency: p.frequency,
                    route: p.route || 'ORAL',
                    duration: parseInt(p.duration),
                    quantity: parseInt(p.quantity),
                    status: PrescriptionStatus.PENDING
                }))
            });
        }

        // 3. Create Lab Orders
        if (labOrders && labOrders.length > 0) {
            await prisma.labOrder.createMany({
                data: labOrders.map((l: any) => ({
                    medicalRecordId: record.id,
                    patientId,
                    testName: l.testName,
                    priority: l.priority || LabPriority.ROUTINE,
                    clinicalIndication: l.indication,
                    status: LabStatus.PENDING
                }))
            });
        }

        // 4. Update Appointment Status
        if (appointmentId) {
            await prisma.appointment.update({
                where: { id: appointmentId },
                data: { status: AppointmentStatus.COMPLETED }
            });
        }

        // 5. Generate Invoice
        // Base consultation fee + extra items
        const invoiceItems = [
            { description: "Consultation Fee", amount: 50.00, quantity: 1 },
            ...(billingItems || [])
        ];
        
        const subtotal = invoiceItems.reduce((sum: number, item: any) => sum + (item.amount * item.quantity), 0);
        
        const invoice = await prisma.invoice.create({
            data: {
                invoiceNumber: `INV-${Date.now()}`,
                patientId,
                medicalRecordId: record.id,
                items: invoiceItems,
                subtotal,
                tax: 0,
                total: subtotal, // Simple tax logic for now
                balance: subtotal,
                status: InvoiceStatus.ISSUED
            }
        });

        res.status(201).json({ 
            message: 'Consultation saved successfully', 
            recordId: record.id,
            invoiceId: invoice.id 
        });

    } catch (error: any) {
        console.error("Consultation Save Error:", error);
        res.status(500).json({ message: error.message || 'Failed to save consultation' });
    }
};

export const orderLabs = async (req: AuthRequest, res: Response) => {
    try {
        const { medicalRecordId, patientId, testName, priority, clinicalIndication } = req.body;
        
        const order = await prisma.labOrder.create({
            data: {
                medicalRecordId, // Optional? Verify schema. Usually required or linked to visit.
                patientId,
                testName,
                priority: priority || LabPriority.ROUTINE,
                clinicalIndication,
                status: LabStatus.PENDING
            }
        });
        
        res.status(201).json(order);
    } catch (error: any) {
        res.status(500).json({ message: error.message || 'Failed to order lab' });
    }
};
