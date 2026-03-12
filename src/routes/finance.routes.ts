import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getPendingInvoices, processPayment, processRefund } from '../controllers/finance.controller';
import { getServices, createService, updateService, deleteService } from '../controllers/service.controller';
import { getExpenses, addExpense, getProfitLoss } from '../controllers/expense.controller';

const router = Router();

router.use(authenticate);

// --- INVOICES ---
// Only Accountants and Admins can access finance data
router.get('/invoices', authorize(['ADMIN', 'ACCOUNTANT']), getPendingInvoices);
router.post('/pay', authorize(['ADMIN', 'ACCOUNTANT']), processPayment);
router.post('/refund', authorize(['ADMIN', 'ACCOUNTANT']), processRefund);

// --- SERVICES (Prices) ---
// Everyone can view prices (Doctors needs it for ordering)
router.get('/services', getServices); 
// Only Admin/Accountant/Head of Dept can manage
router.post('/services', authorize(['ADMIN', 'ACCOUNTANT', 'LAB_TECH', 'PHARMACIST']), createService);
router.patch('/services/:id', authorize(['ADMIN', 'ACCOUNTANT', 'LAB_TECH', 'PHARMACIST']), updateService);
router.delete('/services/:id', authorize(['ADMIN', 'ACCOUNTANT']), deleteService);

// --- EXPENSES ---
router.post('/expenses', authorize(['ADMIN', 'ACCOUNTANT']), addExpense);
router.get('/expenses', authorize(['ADMIN', 'ACCOUNTANT']), getExpenses);
router.get('/reports/profit-loss', authorize(['ADMIN', 'ACCOUNTANT']), getProfitLoss);

export default router;
