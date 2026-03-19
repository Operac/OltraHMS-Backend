import express from 'express';
import { joinWaitlist } from '../controllers/public.controller';
import { apiLimiter } from '../middleware/rateLimiter.middleware';

const router = express.Router();

router.post('/waitlist', apiLimiter, joinWaitlist as any);

export default router;
