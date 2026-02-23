import { Router } from 'express';
import { createAppointment, getAppointments, updateAppointmentStatus, getAppointmentById, rescheduleAppointment } from '../controllers/appointment.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate as any);

// Allow Patients to book appointments
router.post('/', authorize(['ADMIN', 'RECEPTIONIST', 'DOCTOR', 'PATIENT']) as any, createAppointment as any);
router.get('/:id', getAppointmentById as any);
router.get('/', getAppointments as any);
// Update status (Cancel/Confirm) - Patients can Cancel.
router.patch('/:id/status', authorize(['ADMIN', 'DOCTOR', 'PATIENT', 'RECEPTIONIST']) as any, updateAppointmentStatus as any);

// Reschedule
router.patch('/:id/reschedule', authorize(['ADMIN', 'DOCTOR', 'PATIENT', 'RECEPTIONIST']) as any, rescheduleAppointment as any);

export default router;
