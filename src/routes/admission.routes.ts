import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { admitPatient, dischargePatient, getBeds, getWard, updateBedStatus } from '../controllers/admission.controller';

const router = Router();

router.use(authenticate);

// View Beds (Nurses, Admins, Doctors)
router.get('/beds', authorize(['ADMIN', 'NURSE', 'DOCTOR']), getBeds);

// Admit/Discharge (Nurses, Admins)
router.post('/admit', authorize(['ADMIN', 'NURSE']), admitPatient);
router.post('/discharge/:id', authorize(['ADMIN', 'NURSE']), dischargePatient);

// Bed Management
router.get('/wards/:id', authorize(['ADMIN', 'NURSE', 'DOCTOR']), getWard);
router.patch('/beds/:id/status', authorize(['ADMIN', 'NURSE']), updateBedStatus);

export default router;
