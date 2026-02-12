import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { 
    getDoctorDashboardStats, 
    getPatientMedicalHistory, 
    getAssignedPatients,
    saveConsultation, 
    orderLabs,
    updateAppointmentStatus 
} from '../controllers/doctor.controller';

const router = Router();

// Protect all routes: Must be Authenticated AND be a DOCTOR (or ADMIN)
router.use(authenticate, authorize(['DOCTOR', 'ADMIN']));

router.get('/dashboard/stats', getDoctorDashboardStats);
router.get('/patients', getAssignedPatients);
router.get('/patients/:patientId/history', getPatientMedicalHistory);
router.post('/consultation', saveConsultation);
router.post('/labs', orderLabs);
router.patch('/appointments/:id/status', updateAppointmentStatus);

export default router;
