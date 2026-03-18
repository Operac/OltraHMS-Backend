import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import { getPatientInvoices, getInvoiceById, processPayment } from '../controllers/billing.controller';

const router = Router();

router.use(authenticate as any);

router.get('/patient/me', authorize([Role.PATIENT]) as any, getPatientInvoices as any);
// Invoice by ID - accessible by staff (for viewing) and patient (if it's their invoice)
router.get('/:id', authorize([Role.ADMIN, Role.ACCOUNTANT, Role.RECEPTIONIST, Role.DOCTOR, Role.NURSE]) as any, getInvoiceById as any);
// Process payment - staff only
router.post('/pay', authorize([Role.ADMIN, Role.ACCOUNTANT, Role.RECEPTIONIST]) as any, processPayment as any);

export default router;
