import { Router } from 'express';
import { getDashboardStats } from '../controllers/dashboard.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate as any);

// Only Admin and maybe Doctor/Receptionist should see full stats
router.get('/stats', authorize(['ADMIN', 'RECEPTIONIST']) as any, getDashboardStats as any);

export default router;
