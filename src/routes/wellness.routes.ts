
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { prisma } from '../lib/prisma';
import { 
    getMyGoals, 
    createGoal, 
    checkInGoal,
    deleteGoal,
    getMyVitals,
    recordVitals,
    deleteVitals,
    getMyMedications,
    addMedication,
    updateMedicationStatus,
    logMedication,
    deleteMedication,
    getMyMoods,
    recordMood,
    getMySleep,
    recordSleep,
    getMySymptoms,
    recordSymptom,
    getMyReminders,
    createReminder,
    updateReminder,
    deleteReminder,
    getPatientWellness,
    getMyWellnessSummary
} from '../controllers/wellness.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// =============================================================================
// PATIENT WELLNESS ROUTES
// =============================================================================

// Goals (existing)
router.get('/goals', getMyGoals);
router.post('/goals', createGoal);
router.patch('/goals/:id/checkin', checkInGoal);
router.delete('/goals/:id', deleteGoal);

// Vitals
router.get('/vitals', getMyVitals);
router.post('/vitals', recordVitals);
router.delete('/vitals/:id', deleteVitals);

// Medications
router.get('/medications', getMyMedications);
router.post('/medications', addMedication);
router.patch('/medications/:id/status', updateMedicationStatus);
router.post('/medications/:medicationId/log', logMedication);
router.delete('/medications/:id', deleteMedication);

// Mood
router.get('/moods', getMyMoods);
router.post('/moods', recordMood);
router.delete('/moods/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.wellnessMood.delete({ where: { id } });
        res.json({ message: 'Mood entry deleted' });
    } catch (error) {
        console.error('Error deleting mood:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Sleep
router.get('/sleep', getMySleep);
router.post('/sleep', recordSleep);
router.delete('/sleep/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.wellnessSleep.delete({ where: { id } });
        res.json({ message: 'Sleep entry deleted' });
    } catch (error) {
        console.error('Error deleting sleep:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Symptoms
router.get('/symptoms', getMySymptoms);
router.post('/symptoms', recordSymptom);
router.delete('/symptoms/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await prisma.wellnessSymptom.delete({ where: { id } });
        res.json({ message: 'Symptom entry deleted' });
    } catch (error) {
        console.error('Error deleting symptom:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Reminders
router.get('/reminders', getMyReminders);
router.post('/reminders', createReminder);
router.patch('/reminders/:id', updateReminder);
router.delete('/reminders/:id', deleteReminder);

// Summary/Analytics
router.get('/summary', getMyWellnessSummary);

// =============================================================================
// PROVIDER ROUTES (For doctors to view patient wellness data)
// =============================================================================

// Get patient wellness data (for doctors, nurses, admin)
router.get('/patient/:patientId', getPatientWellness);

export default router;
