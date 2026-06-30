import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { getMessages, getAvailableChannels, getChatableStaff, getConversations } from '../controllers/chat.controller';

const router = Router();

router.use(authenticate);

// Group channels this user can access
router.get('/channels', getAvailableChannels as any);

// All active staff members (for starting a DM)
router.get('/staff', getChatableStaff as any);

// DM conversations this user is part of
router.get('/conversations', getConversations as any);

// Message history — works for both group channels and dm: channels
router.get('/:channel', getMessages as any);

export default router;
