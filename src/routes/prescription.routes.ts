import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getPrescriptions, getPrescriptionById, requestRefill, approveRefill, denyRefill, createPrescription, downloadPrescriptionPDF } from '../controllers/prescription.controller';

const router = Router();

router.use(authenticate as any);

router.get('/', authorize(['PATIENT', 'DOCTOR', 'ADMIN', 'PHARMACIST']) as any, getPrescriptions as any);
router.get('/:id', authorize(['PATIENT', 'DOCTOR', 'ADMIN', 'PHARMACIST']) as any, getPrescriptionById as any);
router.get('/:id/download', authorize(['PATIENT', 'DOCTOR', 'ADMIN', 'PHARMACIST']) as any, downloadPrescriptionPDF as any);
router.post('/', authorize(['DOCTOR', 'ADMIN']) as any, createPrescription as any);

// Refill Request
router.post('/:id/refill', authorize(['PATIENT', 'DOCTOR']) as any, requestRefill as any);

// Refill approval / denial (pharmacist or prescribing doctor)
router.post('/:id/approve-refill', authorize(['PHARMACIST', 'DOCTOR', 'ADMIN']) as any, approveRefill as any);
router.post('/:id/deny-refill', authorize(['PHARMACIST', 'DOCTOR', 'ADMIN']) as any, denyRefill as any);

export default router;
