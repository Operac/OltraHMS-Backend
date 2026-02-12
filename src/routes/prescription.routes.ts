import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getPrescriptions, getPrescriptionById, requestRefill, createPrescription } from '../controllers/prescription.controller';

const router = Router();

router.use(authenticate);

router.get('/', authorize(['PATIENT', 'DOCTOR', 'ADMIN', 'PHARMACIST']), getPrescriptions);
router.get('/:id', authorize(['PATIENT', 'DOCTOR', 'ADMIN', 'PHARMACIST']), getPrescriptionById);
router.post('/', authorize(['DOCTOR', 'ADMIN']), createPrescription);

// Refill Request
router.post('/:id/refill', authorize(['PATIENT', 'DOCTOR']), requestRefill);

export default router;
