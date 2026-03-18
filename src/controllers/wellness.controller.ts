import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { startOfDay, differenceInDays, differenceInMinutes } from 'date-fns';

/**
 * Get Patient's Goals
 */
export const getMyGoals = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user || req.user.role !== 'PATIENT') {
            return res.status(403).json({ message: 'Patient access only' });
        }

        const patient = await prisma.patient.findUnique({
             where: { userId: req.user.id }
        });

        if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

        const goals = await prisma.wellnessGoal.findMany({
            where: { patientId: patient.id },
            orderBy: { createdAt: 'desc' }
        });

        res.json(goals);
    } catch (error) {
        console.error('Error fetching goals:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Create New Goal
 */
export const createGoal = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user || req.user.role !== 'PATIENT') return res.status(403).json({ message: 'Forbidden' });

        const patient = await prisma.patient.findUnique({ where: { userId: req.user.id } });
        if (!patient) return res.status(404).json({ message: 'Patient not found' });

        const { description, category, targetValue, unit, frequency } = req.body;

        const goal = await prisma.wellnessGoal.create({
            data: {
                patientId: patient.id,
                description,
                category,
                targetValue: Number(targetValue),
                currentValue: 0,
                unit,
                frequency,
                streak: 0,
                status: 'IN_PROGRESS'
            }
        });

        res.status(201).json(goal);
    } catch (error) {
        console.error('Error creating goal:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Check-in (Increment Progress)
 */
export const checkInGoal = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { value } = req.body; 

        const goal = await prisma.wellnessGoal.findUnique({ where: { id: String(id) } });
        if (!goal) return res.status(404).json({ message: 'Goal not found' });

        const now = new Date();
        const todayStart = startOfDay(now);
        const lastCheckIn = goal.lastCheckedIn ? startOfDay(new Date(goal.lastCheckedIn)) : null;
        
        // 1. Reset if new day
        let effectiveCurrentValue = goal.currentValue;
        let newStreak = goal.streak;
        
        const isNewDay = !lastCheckIn || differenceInDays(todayStart, lastCheckIn) >= 1;
        
        if (isNewDay) {
             effectiveCurrentValue = 0;
             // Check if streak broken (missed yesterday)
             if (lastCheckIn && differenceInDays(todayStart, lastCheckIn) > 1) {
                 newStreak = 0;
             }
        }

        // 2. Add value
        effectiveCurrentValue += Number(value || 1);
        
        // 3. Check Target & Streak
        if (effectiveCurrentValue >= goal.targetValue) {
            const wasAlreadyCompletedToday = !isNewDay && goal.currentValue >= goal.targetValue;
            
            if (!wasAlreadyCompletedToday) {
                 newStreak += 1;
            }
        }

        const updatedGoal = await prisma.wellnessGoal.update({
            where: { id: String(id) },
            data: {
                currentValue: effectiveCurrentValue,
                streak: newStreak,
                lastCheckedIn: now
            }
        });

        res.json(updatedGoal);

    } catch (error) {
        console.error('Error updating goal:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Delete Goal
 */
export const deleteGoal = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user || req.user.role !== 'PATIENT') {
            return res.status(403).json({ message: 'Patient access only' });
        }

        const { id } = req.params;

        const patient = await prisma.patient.findUnique({
            where: { userId: req.user.id }
        });

        if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

        // Verify the goal belongs to this patient
        const goal = await prisma.wellnessGoal.findFirst({
            where: { id: String(id), patientId: patient.id }
        });

        if (!goal) return res.status(404).json({ message: 'Goal not found' });

        await prisma.wellnessGoal.delete({
            where: { id: String(id) }
        });

        res.json({ message: 'Goal deleted successfully' });
    } catch (error) {
        console.error('Error deleting goal:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// =============================================================================
// VITALS CONTROLLERS
// =============================================================================

/**
 * Get Patient's Vitals History
 */
export const getMyVitals = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user || req.user.role !== 'PATIENT') {
            return res.status(403).json({ message: 'Patient access only' });
        }

        const patient = await prisma.patient.findUnique({
            where: { userId: req.user.id }
        });

        if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

        const { type, limit = '30' } = req.query;

        const where: any = { patientId: patient.id };
        if (type) {
            where.type = String(type);
        }

        const vitals = await prisma.wellnessVitals.findMany({
            where,
            orderBy: { recordedAt: 'desc' },
            take: Number(limit)
        });

        res.json(vitals);
    } catch (error) {
        console.error('Error fetching vitals:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Record New Vital Sign
 */
export const recordVitals = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user || req.user.role !== 'PATIENT') {
            return res.status(403).json({ message: 'Patient access only' });
        }

        const patient = await prisma.patient.findUnique({
            where: { userId: req.user.id }
        });

        if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

        const { type, value, value2, unit, notes, recordedAt } = req.body;

        const validTypes = ['BLOOD_PRESSURE', 'WEIGHT', 'HEART_RATE', 'GLUCOSE', 'TEMPERATURE', 'SPO2'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ message: 'Invalid vital type' });
        }

        const vital = await prisma.wellnessVitals.create({
            data: {
                patientId: patient.id,
                type,
                value: Number(value),
                value2: value2 ? Number(value2) : null,
                unit,
                notes,
                recordedAt: recordedAt ? new Date(recordedAt) : new Date()
            }
        });

        res.status(201).json(vital);
    } catch (error) {
        console.error('Error recording vitals:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Delete Vital Record
 */
export const deleteVitals = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        
        await prisma.wellnessVitals.delete({
            where: { id: String(id) }
        });

        res.json({ message: 'Vital record deleted' });
    } catch (error) {
        console.error('Error deleting vitals:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// =============================================================================
// MEDICATION CONTROLLERS
// =============================================================================

/**
 * Get Patient's Medications
 */
export const getMyMedications = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user || req.user.role !== 'PATIENT') {
            return res.status(403).json({ message: 'Patient access only' });
        }

        const patient = await prisma.patient.findUnique({
            where: { userId: req.user.id }
        });

        if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

        const medications = await prisma.wellnessMedication.findMany({
            where: { patientId: patient.id },
            include: {
                logs: {
                    orderBy: { scheduledTime: 'desc' },
                    take: 10
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        res.json(medications);
    } catch (error) {
        console.error('Error fetching medications:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Add New Medication
 */
export const addMedication = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user || req.user.role !== 'PATIENT') {
            return res.status(403).json({ message: 'Patient access only' });
        }

        const patient = await prisma.patient.findUnique({
            where: { userId: req.user.id }
        });

        if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

        const { name, dosage, frequency, times, instructions, startDate, endDate } = req.body;

        const medication = await prisma.wellnessMedication.create({
            data: {
                patientId: patient.id,
                name,
                dosage,
                frequency,
                times: JSON.stringify(times),
                instructions,
                startDate: new Date(startDate),
                endDate: endDate ? new Date(endDate) : null,
                status: 'ACTIVE'
            }
        });

        res.status(201).json(medication);
    } catch (error) {
        console.error('Error adding medication:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Update Medication Status
 */
export const updateMedicationStatus = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const medication = await prisma.wellnessMedication.update({
            where: { id: String(id) },
            data: { status }
        });

        res.json(medication);
    } catch (error) {
        console.error('Error updating medication:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Log Medication Taken/Missed
 */
export const logMedication = async (req: AuthRequest, res: Response) => {
    try {
        const { medicationId } = req.params;
        const { status, takenAt, notes } = req.body;

        const log = await prisma.medicationLog.create({
            data: {
                medicationId: String(medicationId),
                scheduledTime: new Date(),
                takenAt: takenAt ? new Date(takenAt) : (status === 'TAKEN' ? new Date() : null),
                status,
                notes
            }
        });

        res.status(201).json(log);
    } catch (error) {
        console.error('Error logging medication:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Delete Medication
 */
export const deleteMedication = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        
        await prisma.wellnessMedication.delete({
            where: { id: String(id) }
        });

        res.json({ message: 'Medication deleted' });
    } catch (error) {
        console.error('Error deleting medication:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// =============================================================================
// MOOD CONTROLLERS
// =============================================================================

/**
 * Get Patient's Mood History
 */
export const getMyMoods = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user || req.user.role !== 'PATIENT') {
            return res.status(403).json({ message: 'Patient access only' });
        }

        const patient = await prisma.patient.findUnique({
            where: { userId: req.user.id }
        });

        if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

        const { limit = '30' } = req.query;

        const moods = await prisma.wellnessMood.findMany({
            where: { patientId: patient.id },
            orderBy: { recordedAt: 'desc' },
            take: Number(limit)
        });

        res.json(moods);
    } catch (error) {
        console.error('Error fetching moods:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Record Mood
 */
export const recordMood = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user || req.user.role !== 'PATIENT') {
            return res.status(403).json({ message: 'Patient access only' });
        }

        const patient = await prisma.patient.findUnique({
            where: { userId: req.user.id }
        });

        if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

        const { moodScore, stressLevel, energyLevel, notes, recordedAt } = req.body;

        if (moodScore < 1 || moodScore > 10) {
            return res.status(400).json({ message: 'Mood score must be between 1 and 10' });
        }

        const mood = await prisma.wellnessMood.create({
            data: {
                patientId: patient.id,
                moodScore,
                stressLevel: stressLevel ? Number(stressLevel) : null,
                energyLevel: energyLevel ? Number(energyLevel) : null,
                notes,
                recordedAt: recordedAt ? new Date(recordedAt) : new Date()
            }
        });

        res.status(201).json(mood);
    } catch (error) {
        console.error('Error recording mood:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// =============================================================================
// SLEEP CONTROLLERS
// =============================================================================

/**
 * Get Patient's Sleep History
 */
export const getMySleep = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user || req.user.role !== 'PATIENT') {
            return res.status(403).json({ message: 'Patient access only' });
        }

        const patient = await prisma.patient.findUnique({
            where: { userId: req.user.id }
        });

        if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

        const { limit = '30' } = req.query;

        const sleepRecords = await prisma.wellnessSleep.findMany({
            where: { patientId: patient.id },
            orderBy: { recordedAt: 'desc' },
            take: Number(limit)
        });

        // Calculate duration for each record
        const recordsWithDuration = sleepRecords.map(record => ({
            ...record,
            duration: record.duration || (record.wakeTime && record.bedtime 
                ? differenceInMinutes(new Date(record.wakeTime), new Date(record.bedtime)) 
                : null)
        }));

        res.json(recordsWithDuration);
    } catch (error) {
        console.error('Error fetching sleep:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Record Sleep
 */
export const recordSleep = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user || req.user.role !== 'PATIENT') {
            return res.status(403).json({ message: 'Patient access only' });
        }

        const patient = await prisma.patient.findUnique({
            where: { userId: req.user.id }
        });

        if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

        const { bedtime, wakeTime, quality, notes } = req.body;

        const bedtimeDate = new Date(bedtime);
        const wakeTimeDate = new Date(wakeTime);
        const duration = differenceInMinutes(wakeTimeDate, bedtimeDate);

        const sleep = await prisma.wellnessSleep.create({
            data: {
                patientId: patient.id,
                bedtime: bedtimeDate,
                wakeTime: wakeTimeDate,
                quality: quality ? Number(quality) : null,
                notes,
                duration
            }
        });

        res.status(201).json(sleep);
    } catch (error) {
        console.error('Error recording sleep:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// =============================================================================
// SYMPTOM CONTROLLERS
// =============================================================================

/**
 * Get Patient's Symptom History
 */
export const getMySymptoms = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user || req.user.role !== 'PATIENT') {
            return res.status(403).json({ message: 'Patient access only' });
        }

        const patient = await prisma.patient.findUnique({
            where: { userId: req.user.id }
        });

        if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

        const { limit = '30' } = req.query;

        const symptoms = await prisma.wellnessSymptom.findMany({
            where: { patientId: patient.id },
            orderBy: { recordedAt: 'desc' },
            take: Number(limit)
        });

        res.json(symptoms);
    } catch (error) {
        console.error('Error fetching symptoms:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Record Symptom
 */
export const recordSymptom = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user || req.user.role !== 'PATIENT') {
            return res.status(403).json({ message: 'Patient access only' });
        }

        const patient = await prisma.patient.findUnique({
            where: { userId: req.user.id }
        });

        if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

        const { symptom, severity, frequency, location, triggers, notes } = req.body;

        const symptomRecord = await prisma.wellnessSymptom.create({
            data: {
                patientId: patient.id,
                symptom,
                severity: Number(severity),
                frequency,
                location,
                triggers,
                notes
            }
        });

        res.status(201).json(symptomRecord);
    } catch (error) {
        console.error('Error recording symptom:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// =============================================================================
// REMINDER CONTROLLERS
// =============================================================================

/**
 * Get Patient's Reminders
 */
export const getMyReminders = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user || req.user.role !== 'PATIENT') {
            return res.status(403).json({ message: 'Patient access only' });
        }

        const patient = await prisma.patient.findUnique({
            where: { userId: req.user.id }
        });

        if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

        const reminders = await prisma.wellnessReminder.findMany({
            where: { patientId: patient.id },
            orderBy: { time: 'asc' }
        });

        res.json(reminders);
    } catch (error) {
        console.error('Error fetching reminders:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Create Reminder
 */
export const createReminder = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user || req.user.role !== 'PATIENT') {
            return res.status(403).json({ message: 'Patient access only' });
        }

        const patient = await prisma.patient.findUnique({
            where: { userId: req.user.id }
        });

        if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

        const { type, title, description, time, frequency, daysOfWeek } = req.body;

        const reminder = await prisma.wellnessReminder.create({
            data: {
                patientId: patient.id,
                type,
                title,
                description,
                time,
                frequency,
                daysOfWeek: daysOfWeek ? JSON.stringify(daysOfWeek) : null,
                enabled: true
            }
        });

        res.status(201).json(reminder);
    } catch (error) {
        console.error('Error creating reminder:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Update Reminder
 */
export const updateReminder = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { enabled, time, title, description } = req.body;

        const reminder = await prisma.wellnessReminder.update({
            where: { id: String(id) },
            data: {
                ...(enabled !== undefined && { enabled }),
                ...(time && { time }),
                ...(title && { title }),
                ...(description !== undefined && { description })
            }
        });

        res.json(reminder);
    } catch (error) {
        console.error('Error updating reminder:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Delete Reminder
 */
export const deleteReminder = async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        
        await prisma.wellnessReminder.delete({
            where: { id: String(id) }
        });

        res.json({ message: 'Reminder deleted' });
    } catch (error) {
        console.error('Error deleting reminder:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// =============================================================================
// PROVIDER/VIEW PATIENT WELLNESS (For Doctors/Staff to view patient data)
// =============================================================================

/**
 * Get Patient Wellness Data (For Providers)
 */
export const getPatientWellness = async (req: AuthRequest, res: Response) => {
    try {
        // Allow doctors, nurses, admin to view patient wellness
        if (!req.user || !['DOCTOR', 'NURSE', 'ADMIN'].includes(req.user.role)) {
            return res.status(403).json({ message: 'Provider access only' });
        }

        const { patientId } = req.params as { patientId: string };

        // Verify patient exists
        const patient = await prisma.patient.findUnique({
            where: { id: patientId }
        });

        if (!patient) return res.status(404).json({ message: 'Patient not found' });

        // Get all wellness data
        const [goals, vitals, medications, moods, sleep, symptoms, reminders] = await Promise.all([
            prisma.wellnessGoal.findMany({
                where: { patientId: patientId },
                orderBy: { createdAt: 'desc' },
                take: 10
            }),
            prisma.wellnessVitals.findMany({
                where: { patientId: patientId },
                orderBy: { recordedAt: 'desc' },
                take: 30
            }),
            prisma.wellnessMedication.findMany({
                where: { patientId: patientId },
                include: {
                    logs: {
                        orderBy: { scheduledTime: 'desc' },
                        take: 10
                    }
                }
            }),
            prisma.wellnessMood.findMany({
                where: { patientId: patientId },
                orderBy: { recordedAt: 'desc' },
                take: 30
            }),
            prisma.wellnessSleep.findMany({
                where: { patientId: patientId },
                orderBy: { recordedAt: 'desc' },
                take: 14
            }),
            prisma.wellnessSymptom.findMany({
                where: { patientId: patientId },
                orderBy: { recordedAt: 'desc' },
                take: 30
            }),
            prisma.wellnessReminder.findMany({
                where: { patientId: patientId }
            })
        ]);

        // Calculate adherence rates
        const medicationAdherencePromises = medications.map(async (med: any) => {
            const logs = await prisma.medicationLog.findMany({
                where: { medicationId: med.id },
                orderBy: { scheduledTime: 'desc' },
                take: 30
            });
            const taken = logs.filter(l => l.status === 'TAKEN').length;
            return {
                medicationId: med.id,
                adherence: logs.length > 0 ? Math.round((taken / logs.length) * 100) : 0
            };
        });
        const medicationAdherenceResults = await Promise.all(medicationAdherencePromises);

        res.json({
            patientId,
            patientName: `${patient.firstName} ${patient.lastName}`,
            goals,
            vitals,
            medications,
            moods,
            sleep,
            symptoms,
            reminders,
            summary: {
                medicationAdherence: medicationAdherenceResults,
                activeGoals: goals.filter((g: any) => g.status === 'IN_PROGRESS').length,
                completedGoals: goals.filter((g: any) => g.status === 'COMPLETED').length,
                averageMood: moods.length > 0 
                    ? Math.round(moods.reduce((sum: number, m: any) => sum + m.moodScore, 0) / moods.length * 10) / 10 
                    : null,
                averageSleepDuration: sleep.length > 0
                    ? Math.round(sleep.filter((s: any) => s.duration).reduce((sum: number, s: any) => sum + s.duration, 0) / sleep.filter((s: any) => s.duration).length)
                    : null
            }
        });
    } catch (error) {
        console.error('Error fetching patient wellness:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

/**
 * Helper: Calculate Medication Adherence
 */
async function calculateMedicationAdherence(medicationId: string): Promise<number> {
    const logs = await prisma.medicationLog.findMany({
        where: { medicationId },
        orderBy: { scheduledTime: 'desc' },
        take: 30
    });

    if (logs.length === 0) return 0;

    const taken = logs.filter(l => l.status === 'TAKEN').length;
    return Math.round((taken / logs.length) * 100);
}

// =============================================================================
// WELLNESS ANALYTICS
// =============================================================================

/**
 * Get Wellness Summary/Analytics
 */
export const getMyWellnessSummary = async (req: AuthRequest, res: Response) => {
    try {
        if (!req.user || req.user.role !== 'PATIENT') {
            return res.status(403).json({ message: 'Patient access only' });
        }

        const patient = await prisma.patient.findUnique({
            where: { userId: req.user.id }
        });

        if (!patient) return res.status(404).json({ message: 'Patient profile not found' });

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const [goals, vitals, medications, moods, sleep, symptoms] = await Promise.all([
            prisma.wellnessGoal.findMany({
                where: { patientId: patient.id }
            }),
            prisma.wellnessVitals.findMany({
                where: { 
                    patientId: patient.id,
                    recordedAt: { gte: thirtyDaysAgo }
                }
            }),
            prisma.wellnessMedication.findMany({
                where: { 
                    patientId: patient.id,
                    status: 'ACTIVE'
                },
                include: {
                    logs: {
                        where: { scheduledTime: { gte: thirtyDaysAgo } }
                    }
                }
            }),
            prisma.wellnessMood.findMany({
                where: { 
                    patientId: patient.id,
                    recordedAt: { gte: thirtyDaysAgo }
                }
            }),
            prisma.wellnessSleep.findMany({
                where: { 
                    patientId: patient.id,
                    recordedAt: { gte: thirtyDaysAgo }
                }
            }),
            prisma.wellnessSymptom.findMany({
                where: { 
                    patientId: patient.id,
                    recordedAt: { gte: thirtyDaysAgo }
                }
            })
        ]);

        // Calculate summaries
        const totalGoals = goals.length;
        const completedGoals = goals.filter(g => g.status === 'COMPLETED').length;
        
        // Calculate medication adherence
        let totalLogs = 0;
        let takenLogs = 0;
        medications.forEach((med: any) => {
            totalLogs += med.logs.length;
            takenLogs += med.logs.filter((log: any) => log.status === 'TAKEN').length;
        });
        const medicationAdherence = totalLogs > 0 ? Math.round((takenLogs / totalLogs) * 100) : null;

        // Calculate mood average
        const moodAvg = moods.length > 0 
            ? Math.round(moods.reduce((sum, m) => sum + m.moodScore, 0) / moods.length * 10) / 10 
            : null;

        // Calculate sleep average
        const sleepRecords = sleep.filter((s: any) => s.duration);
        const sleepAvg = sleepRecords.length > 0 
            ? Math.round(sleepRecords.reduce((sum: number, s: any) => sum + s.duration, 0) / sleepRecords.length)
            : null;

        // Get latest vitals by type
        const latestVitals: any = {};
        vitals.forEach((v: any) => {
            if (!latestVitals[v.type] || new Date(v.recordedAt) > new Date(latestVitals[v.type].recordedAt)) {
                latestVitals[v.type] = v;
            }
        });

        // Count symptoms by severity
        const severeSymptoms = symptoms.filter((s: any) => s.severity >= 7).length;

        res.json({
            period: 'Last 30 days',
            goals: {
                total: totalGoals,
                completed: completedGoals,
                inProgress: totalGoals - completedGoals,
                completionRate: totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0
            },
            vitals: latestVitals,
            medications: {
                activeCount: medications.length,
                adherence: medicationAdherence
            },
            mood: {
                average: moodAvg,
                entries: moods.length
            },
            sleep: {
                averageDurationMinutes: sleepAvg,
                entries: sleep.length
            },
            symptoms: {
                total: symptoms.length,
                severe: severeSymptoms
            }
        });
    } catch (error) {
        console.error('Error fetching wellness summary:', error);
        res.status(500).json({ message: 'Server error' });
    }
};
