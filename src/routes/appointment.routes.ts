import { Router } from 'express';
import { createAppointment, getAppointments, updateAppointmentStatus, getAppointmentById, rescheduleAppointment } from '../controllers/appointment.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

// Allow Patients to book appointments
router.post('/', authorize(['ADMIN', 'RECEPTIONIST', 'DOCTOR', 'PATIENT']), createAppointment);
router.get('/:id', getAppointmentById);
router.get('/', getAppointments);
// Update status (Cancel/Confirm) - Patients can Cancel.
router.patch('/:id/status', authorize(['ADMIN', 'DOCTOR', 'PATIENT']), updateAppointmentStatus);

// Reschedule
router.patch('/:id/reschedule', authorize(['ADMIN', 'DOCTOR', 'PATIENT']), rescheduleAppointment);

export default router;
