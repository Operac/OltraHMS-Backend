import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import { getPatientInvoices, getInvoiceById, processPayment, submitPayment, confirmPayment, getPendingPayments } from '../controllers/billing.controller';

const router = Router();

router.use(authenticate as any);

router.get('/patient/me', authorize([Role.PATIENT]) as any, getPatientInvoices as any);
router.get('/pending', authorize([Role.ADMIN, Role.ACCOUNTANT]) as any, getPendingPayments as any);
// Invoice by ID - accessible by staff (for viewing) and patient (if it's their invoice)
router.get('/:id', authorize([Role.ADMIN, Role.ACCOUNTANT, Role.RECEPTIONIST, Role.DOCTOR, Role.NURSE, Role.PATIENT]) as any, getInvoiceById as any);
// Process payment - staff only
router.post('/pay', authorize([Role.ADMIN, Role.ACCOUNTANT, Role.RECEPTIONIST]) as any, processPayment as any);

// Payment Confirmation Workflow
// Patient submits payment details (cash/bank transfer)
router.post('/submit', authorize([Role.PATIENT]) as any, submitPayment as any);
// Admin/Accountant confirms or rejects payment
router.post('/confirm', authorize([Role.ADMIN, Role.ACCOUNTANT]) as any, confirmPayment as any);

export default router;
