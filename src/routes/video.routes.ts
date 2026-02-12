import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { createVideoSession, endVideoSession, getVideoSession } from '../controllers/video.controller';

const router = Router();

router.post('/sessions', authenticate, createVideoSession);
router.post('/sessions/end', authenticate, endVideoSession);
router.get('/sessions/:appointmentId', authenticate, getVideoSession);

export default router;
