import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { 
    getFinancialStats, 
    getPatientStats, 
    getInventoryStats 
} from '../controllers/report.controller';
import { Role } from '@prisma/client';

const router = Router();

// Reports accessible by Admin
router.use(authenticate as any);
router.use(authorize([Role.ADMIN]) as any);

router.get('/finance', getFinancialStats as any);
router.get('/patients', getPatientStats as any);
router.get('/inventory', getInventoryStats as any);

export default router;
