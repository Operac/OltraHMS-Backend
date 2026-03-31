import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
    getPendingTriage,
    createTriage,
    getPatientTriageHistory,
    getTodayTriages,
    updateTriage
} from '../controllers/triage.controller';

const router = Router();

router.use(authenticate);

// Nurse, Doctor, Admin can access triage
const triageRoles = ['NURSE', 'DOCTOR', 'ADMIN'] as any;

router.get('/pending', authorize(triageRoles) as any, getPendingTriage as any);
router.get('/today', authorize(triageRoles) as any, getTodayTriages as any);
router.get('/patient/:patientId', authorize(triageRoles) as any, getPatientTriageHistory as any);
router.post('/', authorize(triageRoles) as any, createTriage as any);
router.patch('/:id', authorize(triageRoles) as any, updateTriage as any);

export default router;
