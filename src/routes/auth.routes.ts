import { Router } from 'express';
import { register, login, resetPasswordRequest, updateProfile } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', register as any);
router.post('/login', login as any);
router.post('/forgot-password', resetPasswordRequest as any);
router.patch('/profile', authenticate as any, updateProfile as any); // Add this line

export default router;
