import { Router } from 'express';
import { register, login, refreshAccessToken, resetPasswordRequest, resetPasswordConfirm, updateProfile, setupTwoFactor, enableTwoFactor, disableTwoFactor, verifyTwoFactor, changePassword, getTwoFactorStatus } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { authLimiter, loginLimiter, refreshLimiter } from '../middleware/rateLimiter.middleware';

const router = Router();

// Apply rate limiting to auth endpoints
router.post('/register', authLimiter, register as any);
router.post('/login', loginLimiter, login as any);
router.post('/refresh', refreshLimiter, refreshAccessToken as any);
router.post('/forgot-password', authLimiter, resetPasswordRequest as any);
router.post('/reset-password', authLimiter, resetPasswordConfirm as any);
router.get('/2fa/status', authenticate as any, getTwoFactorStatus as any);
router.post('/2fa/setup', authenticate as any, setupTwoFactor as any);
router.post('/2fa/enable', authenticate as any, enableTwoFactor as any);
router.post('/2fa/disable', authenticate as any, disableTwoFactor as any);
router.post('/2fa/verify', authLimiter, verifyTwoFactor as any);
router.patch('/profile', authenticate as any, updateProfile as any);
router.post('/change-password', authenticate as any, changePassword as any);

export default router;
