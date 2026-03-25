import { Router } from 'express';
import { generatePayroll, getPayrolls, getMyPayrolls, markAsPaid, updatePayroll, downloadPayslipPDF } from '../controllers/payroll.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Staff View
router.get('/my', authenticate, getMyPayrolls);

// PDF Download
router.get('/:id/pdf', authenticate, downloadPayslipPDF);

// Admin / HR Actions
router.post('/generate', authenticate, authorize(['ADMIN', 'ACCOUNTANT']), generatePayroll);
router.get('/', authenticate, authorize(['ADMIN', 'ACCOUNTANT']), getPayrolls);
router.patch('/:id', authenticate, authorize(['ADMIN', 'ACCOUNTANT']), updatePayroll);
router.patch('/:id/pay', authenticate, authorize(['ADMIN', 'ACCOUNTANT']), markAsPaid);

export default router;
