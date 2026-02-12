import { Router } from 'express';
import { getDoctors } from '../controllers/staff.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.use(authenticate);

router.get('/doctors', getDoctors);

export default router;
