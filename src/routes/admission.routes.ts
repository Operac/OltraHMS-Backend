import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { admitPatient, createAdmissionDeposit, dischargePatient, getBeds, getWard, payAdmissionDeposit, updateBedStatus } from '../controllers/admission.controller';

const router = Router();

router.use(authenticate);

// View Beds (Accountants, Nurses, Admins, Doctors)
router.get('/beds', authorize(['ADMIN', 'ACCOUNTANT', 'NURSE', 'DOCTOR']), getBeds);
router.post('/deposit', authorize(['ADMIN', 'ACCOUNTANT', 'NURSE', 'RECEPTIONIST']), createAdmissionDeposit);
router.post('/deposit/pay', authorize(['ADMIN', 'ACCOUNTANT', 'NURSE', 'RECEPTIONIST']), payAdmissionDeposit);

// Admit/Discharge (Nurses, Admins)
router.post('/admit', authorize(['ADMIN', 'NURSE']), admitPatient);
router.post('/discharge/:id', authorize(['ADMIN', 'NURSE']), dischargePatient);

// Bed Management
router.get('/wards/:id', authorize(['ADMIN', 'ACCOUNTANT', 'NURSE', 'DOCTOR']), getWard);
router.patch('/beds/:id/status', authorize(['ADMIN', 'NURSE']), updateBedStatus);

export default router;
