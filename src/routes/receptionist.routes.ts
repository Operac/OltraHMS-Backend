
import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import { 
    getDailyAppointments, 
    checkInPatient, 
    markNoShow,
    registerPatient, 
    searchPatients, 
    bookAppointment,
    listDoctors
} from '../controllers/receptionist.controller';

const router = express.Router();

// Reception workflows expose and mutate patient data, so authentication alone
// is not sufficient: every endpoint is restricted to reception staff or admins.
router.use(authenticate as any);

// Read-only operational queues are shared with nurses. Mutating reception
// workflows remain restricted below.
router.get('/appointments/daily', authorize([Role.RECEPTIONIST, Role.ADMIN, Role.NURSE]) as any, getDailyAppointments);
router.get('/patients/search', authorize([Role.RECEPTIONIST, Role.ADMIN, Role.NURSE, Role.DOCTOR]) as any, searchPatients);
router.get('/doctors', authorize([Role.RECEPTIONIST, Role.ADMIN, Role.DOCTOR]) as any, listDoctors);

router.use(authorize([Role.RECEPTIONIST, Role.ADMIN]) as any);
router.post('/appointments', bookAppointment);
router.patch('/appointments/:id/check-in', checkInPatient);
router.patch('/appointments/:id/no-show', markNoShow);

router.post('/patients', registerPatient);

export default router;
