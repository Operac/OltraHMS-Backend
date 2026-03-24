
import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';

// ----------------------------------------------------------------------
// NURSE ACTIONS (MAR & FLUIDS)
// ----------------------------------------------------------------------

// Get Scheduled Medications (MAR)
export const getScheduledMedications = async (req: Request, res: Response) => {
    try {
        const patientId = req.query.patientId as string;
        const { date } = req.query; // date defaults to today

        const targetDate = date ? new Date(String(date)) : new Date();
        const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

        // 1. Get Active Prescriptions for the patient
        const prescriptions = await prisma.prescription.findMany({
            where: {
                patientId,
                status: { in: ['PENDING', 'DISPENSED', 'REFILL_REQUESTED'] }
            },
            include: {
                medicalRecord: { include: { doctor: { include: { user: true } } } }
            }
        });

        // 2. Get recorded administrations for today
        const administrations = await prisma.medicationAdministration.findMany({
            where: {
                patientId,
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay
                }
            },
            include: { administeredBy: { include: { user: true } } }
        });

        // 3. (In a real app, logic would generate "slots" based on frequency)
        // For simplicity, we return the plan + what has happened.
        
        res.json({
            prescriptions,
            administrations
        });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching MAR' });
    }
};

// Log Medication Administration
export const logMedicationAdministration = async (req: AuthRequest, res: Response) => {
    try {
        const { prescriptionId, patientId, status, notes, scheduledTime } = req.body;
        const staffId = req.user?.id; // Identify nurse

        // Find Staff record for the logged-in user
        const staff = await prisma.staff.findUnique({ where: { userId: staffId } });
        if (!staff) return res.status(404).json({ message: 'Staff profile not found' });

        const adminRecord = await prisma.medicationAdministration.create({
            data: {
                prescriptionId,
                patientId,
                status, // GIVEN, REFUSED, HELD
                notes,
                scheduledTime: new Date(scheduledTime || Date.now()),
                administeredTime: new Date(),
                administeredById: staff.id
            }
        });

        res.status(201).json(adminRecord);
    } catch (error) {
        res.status(500).json({ message: 'Error logging medication' });
    }
};

// Log Fluid Balance
export const logFluidBalance = async (req: AuthRequest, res: Response) => {
    try {
        const { patientId, admissionId, type, fluidType, amount } = req.body;
        const staffId = req.user?.id;

        const staff = await prisma.staff.findUnique({ where: { userId: staffId } });
        if (!staff) return res.status(404).json({ message: 'Staff profile not found' });

        const fluidRecord = await prisma.fluidBalance.create({
            data: {
                patientId,
                admissionId,
                type, // INTAKE or OUTPUT
                fluidType,
                amount: parseFloat(amount),
                recordedById: staff.id
            }
        });

        res.status(201).json(fluidRecord);
    } catch (error) {
        res.status(500).json({ message: 'Error logging fluid balance' });
    }
};

// Get Patient Charts (Vitals + Fluids)
export const getPatientCharts = async (req: Request, res: Response) => {
    try {
        const { patientId } = req.params;
        const pId = String(patientId);

        // Fetch last 24h or all? Let's limit to 50 recent records
        const vitals = await prisma.vitalSigns.findMany({
            where: { patientId: pId },
            orderBy: { recordedAt: 'desc' },
            take: 20
        });

        const fluids = await prisma.fluidBalance.findMany({
            where: { patientId: pId },
            orderBy: { recordedAt: 'desc' },
            take: 50
        });

        res.json({ vitals, fluids });
    } catch (error) {
        res.status(500).json({ message: 'Error fetching patient charts' });
    }
};


// ----------------------------------------------------------------------
// DOCTOR ACTIONS (WARD ROUNDS)
// ----------------------------------------------------------------------

// Add Ward Round Note
export const addWardRoundNote = async (req: AuthRequest, res: Response) => {
    try {
        const { admissionId, notes } = req.body;
        const staffId = req.user?.id;

        const staff = await prisma.staff.findUnique({ where: { userId: staffId } });
        if (!staff) return res.status(404).json({ message: 'Staff profile not found' });

        const round = await prisma.wardRound.create({
            data: {
                admissionId,
                notes,
                conductedById: staff.id
            }
        });

        res.status(201).json(round);
    } catch (error) {
        res.status(500).json({ message: 'Error adding ward round note' });
    }
};

// Get Ward Rounds for an Admission
export const getWardRounds = async (req: Request, res: Response) => {
    try {
        const { admissionId } = req.params;
        const admId = String(admissionId);

        const rounds = await prisma.wardRound.findMany({
            where: { admissionId: admId },
            orderBy: { roundTime: 'desc' },
            include: { conductedBy: { include: { user: true } } }
        });

        res.json(rounds);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching ward rounds' });
    }
};

export const createDepositInvoice = async (req: AuthRequest, res: Response) => {
    try {
        const { admissionId, amount } = req.body;
        
        const admission = await prisma.admission.findUnique({
            where: { id: admissionId },
            include: { patient: true }
        });

        if (!admission) return res.status(404).json({ message: "Admission not found" });

        // Create Invoice
        const invoice = await prisma.invoice.create({
            data: {
                invoiceNumber: `DEP-${Date.now()}`,
                patientId: admission.patientId,
                items: [{ description: "Hospital Deposit", amount: Number(amount), quantity: 1 }],
                subtotal: Number(amount),
                tax: 0,
                total: Number(amount),
                balance: Number(amount),
                status: 'ISSUED',
                medicalRecordId: null
            }
        });

        res.json(invoice);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Failed to create deposit invoice" });
    }
};
