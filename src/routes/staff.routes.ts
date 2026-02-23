import { Router } from 'express';
import { getDoctors } from '../controllers/staff.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate as any);

router.get('/doctors', getDoctors as any);

export default router;
