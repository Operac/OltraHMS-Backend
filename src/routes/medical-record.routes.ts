import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { createMedicalRecord, getMedicalRecords, getMedicalRecordById, downloadMedicalRecordPDF } from '../controllers/medical-record.controller';

const router = Router();

router.use(authenticate);

router.post('/', authorize(['DOCTOR', 'ADMIN']), createMedicalRecord);
router.get('/', authorize(['DOCTOR', 'ADMIN', 'PATIENT']), getMedicalRecords);
router.get('/:id', authorize(['DOCTOR', 'ADMIN', 'PATIENT']), getMedicalRecordById);

// Download PDF
router.get('/:id/download', authorize(['DOCTOR', 'ADMIN', 'PATIENT']), downloadMedicalRecordPDF);

export default router;
