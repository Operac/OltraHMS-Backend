import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import { getPatientInvoices, getInvoiceById, processPayment } from '../controllers/billing.controller';

const router = Router();

router.use(authenticate as any);

router.get('/patient/me', authorize([Role.PATIENT]) as any, getPatientInvoices as any);
router.get('/:id', getInvoiceById as any);
router.post('/pay', processPayment as any);

export default router;
