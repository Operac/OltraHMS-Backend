import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { AppointmentStatus, PrescriptionStatus, LabStatus, InvoiceStatus, LabPriority } from '@prisma/client';
import { randomBytes } from 'crypto';
import { getDiagnosisSuggestions } from '../services/ai.service';

// Helper function to generate unique invoice numbers
const generateInvoiceNumber = (prefix: string): string => {
    const timestamp = Date.now();
    const random = randomBytes(4).toString('hex');
    return `${prefix}-${timestamp}-${random}`;
};

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

        // PRE-PAYMENT GATE: Check if patient has cleared payment before consultation
        const unpaidInvoices = await prisma.invoice.findMany({
            where: { patientId, balance: { gt: 0 } },
            take: 1
        });
        if (unpaidInvoices.length > 0) {
            return res.status(402).json({
                message: `Payment required before consultation. Outstanding balance: ₦${unpaidInvoices[0].balance.toLocaleString()}`,
                requiredPayment: unpaidInvoices[0].balance
            });
        }

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
        // Note: We don't require medication to exist in hospital catalog because:
        // - Patient may take prescription to external pharmacy
        // - Hospital pharmacy may not have stock
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

        // 5. Generate AI Suggestions (non-blocking, best effort)
        let aiSuggestions = null;
        try {
            const patient = await prisma.patient.findUnique({
                where: { id: patientId },
                select: { dateOfBirth: true, gender: true, allergies: true, chronicConditions: true }
            });

            const latestVitals = await prisma.vitalSigns.findFirst({
                where: { patientId },
                orderBy: { recordedAt: 'desc' }
            });

            const existingMeds = await prisma.prescription.findMany({
                where: { patientId, status: { in: ['PENDING', 'DISPENSED'] } },
                select: { medicationName: true, dosage: true, frequency: true }
            });

            aiSuggestions = await getDiagnosisSuggestions({
                age: patient?.dateOfBirth ? Math.floor((Date.now() - new Date(patient.dateOfBirth).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : undefined,
                gender: patient?.gender || undefined,
                allergies: Array.isArray(patient?.allergies) ? patient.allergies as string[] : [],
                chronicConditions: Array.isArray(patient?.chronicConditions) ? patient.chronicConditions as string[] : [],
                chiefComplaint: soap.subjective,
                subjective: soap.subjective,
                objective: soap.objective,
                vitals: latestVitals ? {
                    bpSystolic: latestVitals.bpSystolic || undefined,
                    bpDiastolic: latestVitals.bpDiastolic || undefined,
                    heartRate: latestVitals.heartRate || undefined,
                    temperature: latestVitals.temperature || undefined,
                    respiratoryRate: latestVitals.respiratoryRate || undefined,
                    oxygenSaturation: latestVitals.oxygenSaturation || undefined,
                } : undefined,
                medications: existingMeds.map(m => ({ name: m.medicationName, dosage: m.dosage, frequency: m.frequency }))
            });

            if (aiSuggestions) {
                await prisma.medicalRecord.update({
                    where: { id: record.id },
                    data: { aiSuggestions: aiSuggestions as any }
                });
            }
        } catch (aiError) {
            console.error('AI suggestion generation failed (non-blocking):', aiError);
        }

        // 6. Generate Invoice (insurance-aware)
        // Base consultation fee from service catalog - MUST be configured by admin
        const consService = await prisma.service.findFirst({ where: { name: { contains: 'Consultation', mode: 'insensitive' } } });
        
        if (!consService) {
            return res.status(400).json({ 
                message: "Consultation fee not configured. Please contact admin to set up service pricing."
            });
        }
        
        const baseFee = consService.price;

        const invoiceItems = [
            { description: consService ? consService.name : "Consultation Fee", amount: baseFee, quantity: 1 },
            ...(billingItems || [])
        ];
        
        const subtotal = invoiceItems.reduce((sum: number, item: any) => sum + (item.amount * item.quantity), 0);
        
        // Check for active insurance
        const activeInsurance = await prisma.patientInsurance.findFirst({
            where: {
                patientId,
                status: { in: ['ACTIVE', 'VERIFIED'] },
                OR: [
                    { validUntil: { gte: new Date() } },
                    { validUntil: null }
                ],
                isPrimary: true
            }
        });

        let insuranceCoveredAmount = 0;
        let patientResponsibility = subtotal;
        let patientInsuranceId: string | undefined;

        if (activeInsurance) {
            const coveragePercent = activeInsurance.coveragePercentage / 100;
            insuranceCoveredAmount = Math.round(subtotal * coveragePercent * 100) / 100;
            patientResponsibility = subtotal - insuranceCoveredAmount;
            patientInsuranceId = activeInsurance.id;
        }

        const invoice = await prisma.invoice.create({
            data: {
                invoiceNumber: generateInvoiceNumber('INV'),
                patientId,
                medicalRecordId: record.id,
                items: invoiceItems,
                subtotal,
                tax: 0,
                total: subtotal,
                balance: patientResponsibility,
                insuranceCoveredAmount,
                patientResponsibility,
                patientInsuranceId,
                status: InvoiceStatus.ISSUED
            }
        });

        res.status(201).json({ 
            message: 'Consultation saved successfully', 
            recordId: record.id,
            invoiceId: invoice.id,
            aiSuggestions 
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
