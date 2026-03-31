import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getPendingPrescriptions, dispenseMedication, getDispensingReport, checkPrescriptionAvailability, createInvoice, submitPayment, clearPayment, waivePayment, getRefillRequests } from '../controllers/pharmacy.controller';

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

// Refill Requests
router.get('/refill-requests', authenticate as any, authorize(['PHARMACIST', 'ADMIN']) as any, getRefillRequests as any);

// Payment gate endpoints
router.post('/submit-payment', authenticate as any, authorize(['PATIENT']) as any, submitPayment as any);
router.post('/clear-payment', authenticate as any, authorize(['ADMIN', 'ACCOUNTANT', 'RECEPTIONIST']) as any, clearPayment as any);
router.post('/waive-payment', authenticate as any, authorize(['ADMIN']) as any, waivePayment as any);

export default router;
