
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { getMessages } from '../controllers/chat.controller';

const router = Router();

router.use(authenticate);

router.get('/:channel', getMessages);

export default router;
