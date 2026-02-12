import { Router } from 'express';
import { createPatient, getPatients, getPatientById, getDashboardStats, getPatientProfile, updatePatientProfile } from '../controllers/patient.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Protect routes
router.use(authenticate);

// Dashboard for Patient
router.get('/dashboard', authorize([Role.PATIENT]), getDashboardStats);
router.get('/profile/me', authorize([Role.PATIENT]), getPatientProfile);
router.patch('/profile', authorize([Role.PATIENT]), updatePatientProfile);

// List/Search: All staff
router.get('/', authorize([Role.ADMIN, Role.DOCTOR, Role.NURSE, Role.RECEPTIONIST, Role.LAB_TECH, Role.PHARMACIST]), getPatients);

// Create: Admin, Receptionist, Doctor, Nurse
router.post('/', authorize([Role.ADMIN, Role.RECEPTIONIST, Role.DOCTOR, Role.NURSE]), createPatient);

// Details: All staff
router.get('/:id', authorize([Role.ADMIN, Role.DOCTOR, Role.NURSE, Role.RECEPTIONIST, Role.LAB_TECH, Role.PHARMACIST]), getPatientById);

export default router;
