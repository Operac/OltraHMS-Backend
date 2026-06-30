import { Router } from 'express';
import { addExpense, getExpenses, getProfitLoss } from '../controllers/expense.controller';
import { authorize } from '../middleware/auth.middleware';

const router = Router();

router.get('/', authorize(['ADMIN', 'ACCOUNTANT'] as any), getExpenses as any);
router.post('/', authorize(['ADMIN', 'ACCOUNTANT'] as any), addExpense as any);
router.get('/profit-loss', authorize(['ADMIN', 'ACCOUNTANT'] as any), getProfitLoss as any);

export default router;
