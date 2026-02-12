import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getPendingPrescriptions, dispenseMedication } from '../controllers/pharmacy.controller';

const router = Router();

// Get Queue
router.get('/queue', authenticate, authorize(['PHARMACIST', 'ADMIN']), getPendingPrescriptions);

// Dispense
router.post('/dispense/:prescriptionId', authenticate, authorize(['PHARMACIST', 'ADMIN']), dispenseMedication);

export default router;
