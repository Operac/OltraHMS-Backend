import { Router } from 'express';
import { getDashboardStats } from '../controllers/dashboard.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

// Only Admin and maybe Doctor/Receptionist should see full stats
router.get('/stats', authorize(['ADMIN', 'RECEPTIONIST']), getDashboardStats);

export default router;
