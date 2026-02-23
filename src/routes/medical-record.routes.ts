import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { createMedicalRecord, getMedicalRecords, getMedicalRecordById, downloadMedicalRecordPDF } from '../controllers/medical-record.controller';

const router = Router();

router.use(authenticate as any);

router.post('/', authorize(['DOCTOR', 'ADMIN']) as any, createMedicalRecord as any);
router.get('/', authorize(['DOCTOR', 'ADMIN', 'PATIENT', 'NURSE']) as any, getMedicalRecords as any);
router.get('/:id', authorize(['DOCTOR', 'ADMIN', 'PATIENT', 'NURSE']) as any, getMedicalRecordById as any);

// Download PDF
router.get('/:id/download', authorize(['DOCTOR', 'ADMIN', 'PATIENT', 'NURSE']) as any, downloadMedicalRecordPDF as any);

export default router;
