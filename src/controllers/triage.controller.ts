import { Response } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth.middleware';
import { TriageLevel } from '@prisma/client';

// Calculate Modified Early Warning Score (MEWS)
function calculateMEWS(vitals: {
    heartRate?: number | null;
    temperature?: number | null;
    respiratoryRate?: number | null;
    bpSystolic?: number | null;
    oxygenSaturation?: number | null;
}): { score: number; details: string[] } {
    let score = 0;
    const details: string[] = [];

    // Heart Rate
    if (vitals.heartRate != null) {
        const hr = vitals.heartRate;
        if (hr <= 40) { score += 2; details.push('Bradycardia (HR ≤40)'); }
        else if (hr <= 50) { score += 1; details.push('Low HR (41-50)'); }
        else if (hr >= 130) { score += 2; details.push('Tachycardia (HR ≥130)'); }
        else if (hr >= 110) { score += 1; details.push('Elevated HR (110-129)'); }
    }

    // Temperature
    if (vitals.temperature != null) {
        const temp = vitals.temperature;
        if (temp <= 35) { score += 2; details.push('Hypothermia (≤35°C)'); }
        else if (temp >= 39) { score += 2; details.push('High fever (≥39°C)'); }
        else if (temp >= 38.5) { score += 1; details.push('Fever (38.5-38.9°C)'); }
    }

    // Respiratory Rate
    if (vitals.respiratoryRate != null) {
        const rr = vitals.respiratoryRate;
        if (rr <= 8) { score += 2; details.push('Bradypnea (RR ≤8)'); }
        else if (rr >= 30) { score += 2; details.push('Tachypnea (RR ≥30)'); }
        else if (rr >= 25) { score += 1; details.push('Elevated RR (25-29)'); }
    }

    // Blood Pressure (Systolic)
    if (vitals.bpSystolic != null) {
        const sbp = vitals.bpSystolic;
        if (sbp <= 70) { score += 3; details.push('Severe hypotension (SBP ≤70)'); }
        else if (sbp <= 80) { score += 2; details.push('Hypotension (SBP 71-80)'); }
        else if (sbp <= 100) { score += 1; details.push('Low BP (SBP 81-100)'); }
        else if (sbp >= 200) { score += 2; details.push('Severe hypertension (SBP ≥200)'); }
    }

    // SpO2
    if (vitals.oxygenSaturation != null) {
        const spo2 = vitals.oxygenSaturation;
        if (spo2 <= 91) { score += 2; details.push('Low SpO2 (≤91%)'); }
        else if (spo2 <= 93) { score += 1; details.push('Borderline SpO2 (92-93%)'); }
    }

    return { score, details };
}

// Map MEWS score to suggested triage level
function mewsToTriageLevel(mews: number): TriageLevel {
    if (mews >= 7) return TriageLevel.RESUSCITATION;
    if (mews >= 5) return TriageLevel.EMERGENT;
    if (mews >= 3) return TriageLevel.URGENT;
    if (mews >= 1) return TriageLevel.LESS_URGENT;
    return TriageLevel.NON_URGENT;
}

/**
 * GET /triage/pending
 * Get patients checked-in but not yet triaged today
 */
export const getPendingTriage = async (req: AuthRequest, res: Response) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Find patients who are checked in today but have no triage record today
        const checkedInAppointments = await prisma.appointment.findMany({
            where: {
                appointmentDate: { gte: today, lt: tomorrow },
                status: { in: ['CHECKED_IN', 'IN_PROGRESS'] }
            },
            include: {
                patient: {
                    select: {
                        id: true,
                        firstName: true,
                        lastName: true,
                        patientNumber: true,
                        dateOfBirth: true,
                        gender: true,
                        bloodGroup: true
                    }
                }
            },
            orderBy: { queuePosition: 'asc' }
        });

        // Get today's triage records to filter out already-triaged patients
        const todayTriages = await prisma.triage.findMany({
            where: { triageTime: { gte: today, lt: tomorrow } },
            select: { patientId: true }
        });
        const triagedPatientIds = new Set(todayTriages.map(t => t.patientId));

        // Get latest vitals for each patient
        const pendingQueue = await Promise.all(
            checkedInAppointments
                .filter(apt => !triagedPatientIds.has(apt.patientId))
                .map(async (apt) => {
                    const latestVitals = await prisma.vitalSigns.findFirst({
                        where: { patientId: apt.patientId },
                        orderBy: { recordedAt: 'desc' }
                    });
                    return {
                        appointmentId: apt.id,
                        patient: apt.patient,
                        queuePosition: apt.queuePosition,
                        status: apt.status,
                        reason: apt.reason,
                        hasVitals: !!latestVitals,
                        latestVitals
                    };
                })
        );

        res.json(pendingQueue);
    } catch (error) {
        console.error('Error fetching pending triage:', error);
        res.status(500).json({ message: 'Failed to fetch pending triage queue' });
    }
};

/**
 * POST /triage
 * Create a triage assessment for a patient
 */
export const createTriage = async (req: AuthRequest, res: Response) => {
    try {
        const { patientId, chiefComplaint, triageLevel, vitalSigns } = req.body;

        if (!patientId || !chiefComplaint || !triageLevel) {
            return res.status(400).json({ message: 'patientId, chiefComplaint, and triageLevel are required' });
        }

        // Verify patient exists
        const patient = await prisma.patient.findUnique({ where: { id: patientId } });
        if (!patient) return res.status(404).json({ message: 'Patient not found' });

        // Get the nurse's staff ID
        const staff = await prisma.staff.findUnique({ where: { userId: req.user!.id } });
        if (!staff) return res.status(403).json({ message: 'Staff profile not found' });

        let vitalSignsId: string;

        // If vital signs data is provided, create a vital signs record
        if (vitalSigns) {
            // Calculate BMI if weight and height provided
            let bmi = null;
            if (vitalSigns.weight && vitalSigns.height) {
                const heightInMeters = vitalSigns.height / 100;
                bmi = parseFloat((vitalSigns.weight / (heightInMeters * heightInMeters)).toFixed(2));
            }

            const vitals = await prisma.vitalSigns.create({
                data: {
                    patientId,
                    bpSystolic: vitalSigns.bpSystolic || null,
                    bpDiastolic: vitalSigns.bpDiastolic || null,
                    heartRate: vitalSigns.heartRate || null,
                    respiratoryRate: vitalSigns.respiratoryRate || null,
                    temperature: vitalSigns.temperature || null,
                    oxygenSaturation: vitalSigns.oxygenSaturation || null,
                    painScore: vitalSigns.painScore || null,
                    weight: vitalSigns.weight || null,
                    height: vitalSigns.height || null,
                    bmi,
                    source: 'TRIAGE',
                    recordedBy: req.user!.id
                }
            });
            vitalSignsId = vitals.id;
        } else {
            // Use latest existing vitals for this patient
            const existingVitals = await prisma.vitalSigns.findFirst({
                where: { patientId },
                orderBy: { recordedAt: 'desc' }
            });
            if (!existingVitals) {
                return res.status(400).json({ message: 'Vital signs are required for triage. Provide vitalSigns or record them first.' });
            }
            vitalSignsId = existingVitals.id;
        }

        // Get the vital signs for MEWS calculation
        const vitalsRecord = await prisma.vitalSigns.findUnique({ where: { id: vitalSignsId } });
        const mewsResult = vitalsRecord ? calculateMEWS(vitalsRecord) : { score: 0, details: [] };
        const suggestedLevel = mewsToTriageLevel(mewsResult.score);

        // Check if nurse is overriding the AI/MEWS suggestion
        const wasOverridden = triageLevel !== suggestedLevel;

        // Create triage record
        const triage = await prisma.triage.create({
            data: {
                patientId,
                nurseId: staff.id,
                vitalSignsId,
                chiefComplaint,
                triageLevel: triageLevel as TriageLevel,
                mewsScore: mewsResult.score,
                aiSuggestion: suggestedLevel === TriageLevel.RESUSCITATION ? 1
                    : suggestedLevel === TriageLevel.EMERGENT ? 2
                    : suggestedLevel === TriageLevel.URGENT ? 3
                    : suggestedLevel === TriageLevel.LESS_URGENT ? 4 : 5,
                wasOverridden,
                overrideReason: wasOverridden ? `MEWS suggested ${suggestedLevel}, nurse selected ${triageLevel}` : undefined
            },
            include: {
                patient: { select: { firstName: true, lastName: true, patientNumber: true } },
                nurse: { include: { user: { select: { firstName: true, lastName: true } } } },
                vitalSigns: true
            }
        });

        res.status(201).json({
            ...triage,
            mewsDetails: mewsResult.details,
            suggestedLevel
        });
    } catch (error) {
        console.error('Error creating triage:', error);
        res.status(500).json({ message: 'Failed to create triage assessment' });
    }
};

/**
 * GET /triage/patient/:patientId
 * Get triage history for a patient
 */
export const getPatientTriageHistory = async (req: AuthRequest, res: Response) => {
    try {
        const patientId = req.params.patientId as string;

        const triages = await prisma.triage.findMany({
            where: { patientId },
            include: {
                nurse: { include: { user: { select: { firstName: true, lastName: true } } } },
                vitalSigns: true
            },
            orderBy: { triageTime: 'desc' },
            take: 20
        });

        res.json(triages);
    } catch (error) {
        console.error('Error fetching triage history:', error);
        res.status(500).json({ message: 'Failed to fetch triage history' });
    }
};

/**
 * GET /triage/today
 * Get all triage assessments done today
 */
export const getTodayTriages = async (req: AuthRequest, res: Response) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const triages = await prisma.triage.findMany({
            where: { triageTime: { gte: today, lt: tomorrow } },
            include: {
                patient: { select: { firstName: true, lastName: true, patientNumber: true } },
                nurse: { include: { user: { select: { firstName: true, lastName: true } } } },
                vitalSigns: true
            },
            orderBy: { triageTime: 'desc' }
        });

        // Stats
        const stats = {
            total: triages.length,
            resuscitation: triages.filter(t => t.triageLevel === 'RESUSCITATION').length,
            emergent: triages.filter(t => t.triageLevel === 'EMERGENT').length,
            urgent: triages.filter(t => t.triageLevel === 'URGENT').length,
            lessUrgent: triages.filter(t => t.triageLevel === 'LESS_URGENT').length,
            nonUrgent: triages.filter(t => t.triageLevel === 'NON_URGENT').length,
            overrides: triages.filter(t => t.wasOverridden).length
        };

        res.json({ triages, stats });
    } catch (error) {
        console.error('Error fetching today triages:', error);
        res.status(500).json({ message: 'Failed to fetch today triages' });
    }
};

/**
 * PATCH /triage/:id
 * Update a triage record
 */
export const updateTriage = async (req: AuthRequest, res: Response) => {
    try {
        const id = req.params.id as string;
        const { triageLevel, chiefComplaint, overrideReason } = req.body;

        const existing = await prisma.triage.findUnique({ where: { id } });
        if (!existing) return res.status(404).json({ message: 'Triage record not found' });

        const updateData: any = {};
        if (triageLevel) {
            updateData.triageLevel = triageLevel as TriageLevel;
            if (existing.aiSuggestion) {
                const suggestedMap: Record<number, TriageLevel> = {
                    1: TriageLevel.RESUSCITATION,
                    2: TriageLevel.EMERGENT,
                    3: TriageLevel.URGENT,
                    4: TriageLevel.LESS_URGENT,
                    5: TriageLevel.NON_URGENT
                };
                const suggested = suggestedMap[existing.aiSuggestion];
                if (triageLevel !== suggested) {
                    updateData.wasOverridden = true;
                    updateData.overrideReason = overrideReason || `Changed from ${existing.triageLevel} to ${triageLevel}`;
                }
            }
        }
        if (chiefComplaint) updateData.chiefComplaint = chiefComplaint;

        const updated = await prisma.triage.update({
            where: { id },
            data: updateData,
            include: {
                patient: { select: { firstName: true, lastName: true, patientNumber: true } },
                nurse: { include: { user: { select: { firstName: true, lastName: true } } } },
                vitalSigns: true
            }
        });

        res.json(updated);
    } catch (error) {
        console.error('Error updating triage:', error);
        res.status(500).json({ message: 'Failed to update triage' });
    }
};
