import { Router } from 'express';
import { createPatient, getPatients, getPatientById, getDashboardStats, getPatientProfile, updatePatientProfile, getMedicationSchedule, updatePatientById } from '../controllers/patient.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Protect routes
router.use(authenticate as any);

// IMPORTANT: Specific routes must come BEFORE parameterized routes
// Dashboard for Patient
router.get('/dashboard', authorize([Role.PATIENT]) as any, getDashboardStats as any);
// Profile routes - must come BEFORE /:id
router.get('/profile/me', authorize([Role.PATIENT]) as any, getPatientProfile as any);
router.patch('/profile', authorize([Role.PATIENT]) as any, updatePatientProfile as any);
router.get('/medications', authorize([Role.PATIENT]) as any, getMedicationSchedule as any);

// List/Search: All staff
router.get('/', authorize([Role.ADMIN, Role.DOCTOR, Role.NURSE, Role.RECEPTIONIST]) as any, getPatients as any);

// Create: Admin, Receptionist, Doctor, Nurse
router.post('/', authorize([Role.ADMIN, Role.RECEPTIONIST, Role.DOCTOR, Role.NURSE]) as any, createPatient as any);

// Details: All staff - MUST come AFTER specific routes like /profile/me
router.get('/:id', authorize([Role.ADMIN, Role.DOCTOR, Role.NURSE, Role.RECEPTIONIST]) as any, getPatientById as any);

// Update patient by id: Admin, Receptionist, Doctor, Nurse
router.patch('/:id', authorize([Role.ADMIN, Role.RECEPTIONIST, Role.DOCTOR, Role.NURSE]) as any, updatePatientById as any);

export default router;
