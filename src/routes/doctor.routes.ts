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
router.use(authenticate as any, authorize(['DOCTOR', 'ADMIN']) as any);

router.get('/dashboard/stats', getDoctorDashboardStats as any);
router.get('/patients', getAssignedPatients as any);
router.get('/patients/:patientId/history', getPatientMedicalHistory as any);
router.post('/consultation', saveConsultation as any);
router.post('/labs', orderLabs as any);
router.patch('/appointments/:id/status', updateAppointmentStatus as any);

export default router;
