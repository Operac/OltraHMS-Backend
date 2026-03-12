import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getPendingPrescriptions, dispenseMedication, getDispensingReport, checkPrescriptionAvailability, createInvoice } from '../controllers/pharmacy.controller';

const router = Router();

// Get Queue
router.get('/queue', authenticate as any, authorize(['PHARMACIST', 'ADMIN']) as any, getPendingPrescriptions as any);

// Check Availability (for batch dispensing)
router.post('/check-availability', authenticate as any, authorize(['PHARMACIST', 'ADMIN']) as any, checkPrescriptionAvailability as any);

// Dispense
router.post('/dispense/:prescriptionId', authenticate as any, authorize(['PHARMACIST', 'ADMIN']) as any, dispenseMedication as any);

// Create Invoice (for prescriptions)
router.post('/invoice', authenticate as any, authorize(['PHARMACIST', 'ADMIN', 'ACCOUNTANT']) as any, createInvoice as any);

// Reports
router.get('/report', authenticate as any, authorize(['PHARMACIST', 'ADMIN']) as any, getDispensingReport as any);

export default router;
