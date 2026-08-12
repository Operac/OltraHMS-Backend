import { Router } from 'express';
import { 
    getDoctorQueue, 
    getAllQueues, 
    checkInPatient, 
    addWalkIn, 
    callNextPatient, 
    reassignPatient,
    getAvailableDoctors,
    updateQueuePosition,
    cancelCheckIn,
    validatePatientInsurance,
    getQueueDisplayList
} from '../controllers/queue.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';

const router = Router();

// All routes require authentication
router.use(authenticate as any);

// Validate patient insurance (NHIS/HMO)
router.get('/insurance/validate/:patientId', authorize([Role.ADMIN, Role.RECEPTIONIST, Role.NURSE]) as any, validatePatientInsurance);

// Get all queues (reception overview)
router.get('/', authorize([Role.ADMIN, Role.RECEPTIONIST, Role.DOCTOR, Role.NURSE]) as any, getAllQueues);

// Flat queue list for the TV/queue-display screen
router.get('/all', authorize([Role.ADMIN, Role.RECEPTIONIST, Role.DOCTOR, Role.NURSE]) as any, getQueueDisplayList);

// Get queue for specific doctor
router.get('/doctor/:doctorId', authorize([Role.ADMIN, Role.RECEPTIONIST, Role.DOCTOR]) as any, getDoctorQueue);

// Get available doctors (for walk-in assignment)
router.get('/doctors/available', authorize([Role.ADMIN, Role.RECEPTIONIST]) as any, getAvailableDoctors);

// Check in a patient
router.post('/checkin', authorize([Role.ADMIN, Role.RECEPTIONIST]) as any, checkInPatient);

// Add walk-in patient
router.post('/walkin', authorize([Role.ADMIN, Role.RECEPTIONIST]) as any, addWalkIn);

// Call next patient (doctor calls from their queue)
router.post('/call-next', authorize([Role.ADMIN, Role.RECEPTIONIST, Role.DOCTOR]) as any, callNextPatient);

// Reassign patient to another doctor
router.post('/reassign', authorize([Role.ADMIN, Role.RECEPTIONIST]) as any, reassignPatient);

// Update queue position (manual reorder)
router.post('/reorder', authorize([Role.ADMIN, Role.RECEPTIONIST]) as any, updateQueuePosition);

// Cancel check-in (remove from queue)
router.delete('/:appointmentId/checkin', authorize([Role.ADMIN, Role.RECEPTIONIST]) as any, cancelCheckIn);

export default router;
