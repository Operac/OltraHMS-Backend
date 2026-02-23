
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { startOfDay, differenceInDays } from 'date-fns';

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
             // If difference > 1 day, streak resets.
             if (lastCheckIn && differenceInDays(todayStart, lastCheckIn) > 1) {
                 newStreak = 0;
             }
        }

        // 2. Add value
        effectiveCurrentValue += Number(value || 1);
        
        // 3. Check Target & Streak
        if (effectiveCurrentValue >= goal.targetValue) {
            // Check if we JUST crossed the threshold today
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
