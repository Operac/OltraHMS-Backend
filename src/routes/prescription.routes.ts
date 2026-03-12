import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getPrescriptions, getPrescriptionById, requestRefill, createPrescription, downloadPrescriptionPDF } from '../controllers/prescription.controller';

const router = Router();

router.use(authenticate as any);

router.get('/', authorize(['PATIENT', 'DOCTOR', 'ADMIN', 'PHARMACIST']) as any, getPrescriptions as any);
router.get('/:id', authorize(['PATIENT', 'DOCTOR', 'ADMIN', 'PHARMACIST']) as any, getPrescriptionById as any);
router.get('/:id/download', authorize(['PATIENT', 'DOCTOR', 'ADMIN', 'PHARMACIST']) as any, downloadPrescriptionPDF as any);
router.post('/', authorize(['DOCTOR', 'ADMIN']) as any, createPrescription as any);

// Refill Request
router.post('/:id/refill', authorize(['PATIENT', 'DOCTOR']) as any, requestRefill as any);

export default router;
