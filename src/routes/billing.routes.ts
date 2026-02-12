import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import { getPatientInvoices, getInvoiceById, processPayment } from '../controllers/billing.controller';

const router = Router();

router.use(authenticate);

router.get('/patient/me', authorize([Role.PATIENT]), getPatientInvoices);
router.get('/:id', getInvoiceById);
router.post('/pay', processPayment);

export default router;
