import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getPendingPrescriptions, dispenseMedication, getDispensingReport } from '../controllers/pharmacy.controller';

const router = Router();

// Get Queue
router.get('/queue', authenticate as any, authorize(['PHARMACIST', 'ADMIN']) as any, getPendingPrescriptions as any);

// Dispense
router.post('/dispense/:prescriptionId', authenticate as any, authorize(['PHARMACIST', 'ADMIN']) as any, dispenseMedication as any);

// Reports
router.get('/report', authenticate as any, authorize(['PHARMACIST', 'ADMIN']) as any, getDispensingReport as any);

export default router;
