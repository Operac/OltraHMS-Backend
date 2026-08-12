
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
router.use(authorize([Role.RECEPTIONIST, Role.ADMIN]) as any);

router.get('/appointments/daily', getDailyAppointments);
router.post('/appointments', bookAppointment);
router.patch('/appointments/:id/check-in', checkInPatient);
router.patch('/appointments/:id/no-show', markNoShow);

router.get('/patients/search', searchPatients);
router.post('/patients', registerPatient);

router.get('/doctors', listDoctors);

export default router;
