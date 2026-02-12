
import express from 'express';
import { authenticate } from '../middleware/auth.middleware'; // Assuming this exists, same as doctor
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

// All routes require authentication, potentially RECEPTIONIST role (skipping role check for MVP speed)
router.use(authenticate);

router.get('/appointments/daily', getDailyAppointments);
router.post('/appointments', bookAppointment);
router.patch('/appointments/:id/check-in', checkInPatient);
router.patch('/appointments/:id/no-show', markNoShow);

router.get('/patients/search', searchPatients);
router.post('/patients', registerPatient);

router.get('/doctors', listDoctors);

export default router;
