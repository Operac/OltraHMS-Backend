import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { createVideoSession, endVideoSession, getVideoSession } from '../controllers/video.controller';

const router = Router();

router.post('/sessions', authenticate as any, createVideoSession as any);
router.post('/sessions/end', authenticate as any, endVideoSession as any);
router.get('/sessions/:appointmentId', authenticate as any, getVideoSession as any);

export default router;
