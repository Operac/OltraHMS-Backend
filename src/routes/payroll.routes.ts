import { Router } from 'express';
import { generatePayroll, getPayrolls, getMyPayrolls, markAsPaid } from '../controllers/payroll.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Staff View
router.get('/my', authenticate, getMyPayrolls);

// Admin / HR Actions
router.post('/generate', authenticate, authorize(['ADMIN', 'ACCOUNTANT']), generatePayroll);
router.get('/', authenticate, authorize(['ADMIN', 'ACCOUNTANT']), getPayrolls);
router.patch('/:id/pay', authenticate, authorize(['ADMIN', 'ACCOUNTANT']), markAsPaid);

export default router;
