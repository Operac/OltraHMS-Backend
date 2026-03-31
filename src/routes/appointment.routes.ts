import { Router } from 'express';
import { createAppointment, getAppointments, updateAppointmentStatus, getAppointmentById, rescheduleAppointment, submitAppointmentPayment, clearAppointmentPayment, waiveAppointmentPayment } from '../controllers/appointment.controller';
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

// Payment gate endpoints
router.post('/:id/submit-payment', authorize(['PATIENT']) as any, submitAppointmentPayment as any);
router.post('/:id/clear-payment', authorize(['ADMIN', 'ACCOUNTANT', 'RECEPTIONIST']) as any, clearAppointmentPayment as any);
router.post('/:id/waive-payment', authorize(['ADMIN']) as any, waiveAppointmentPayment as any);

export default router;
