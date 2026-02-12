import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getAllWards, getWardDetails, admitPatient, dischargePatient, updateBedStatus } from '../controllers/inpatient.controller';

const router = Router();

// Wards & Beds
router.get('/wards', authenticate, getAllWards);
router.get('/wards/:id', authenticate, getWardDetails);
router.patch('/beds/:bedId/status', authenticate, authorize(['NURSE', 'ADMIN']), updateBedStatus);

// Admissions
router.post('/admit', authenticate, authorize(['DOCTOR', 'ADMIN']), admitPatient);
router.post('/discharge', authenticate, authorize(['DOCTOR', 'NURSE', 'ADMIN']), dischargePatient);

export default router;
