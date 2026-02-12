import { Router } from 'express';
import { register, login, resetPasswordRequest, updateProfile } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', resetPasswordRequest);
router.patch('/profile', authenticate, updateProfile); // Add this line

export default router;
