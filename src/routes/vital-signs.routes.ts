import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { createVitalSigns, getVitalSignsByPatient } from '../controllers/vital-signs.controller';
import { Role } from '@prisma/client';

const router = Router();

router.use(authenticate as any);

// Record Vitals: Nurse, Doctor, Admin, EMT(if exists)
router.post('/', authorize([Role.NURSE, Role.DOCTOR, Role.ADMIN, Role.RECEPTIONIST]) as any, createVitalSigns as any); // Receptionist added for triage flexibility if needed

// Get Vitals: All medical staff
router.get('/:patientId', authorize([Role.NURSE, Role.DOCTOR, Role.ADMIN, Role.RECEPTIONIST]) as any, getVitalSignsByPatient as any);

export default router;
