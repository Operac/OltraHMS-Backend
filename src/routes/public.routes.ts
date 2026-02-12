import express from 'express';
import { joinWaitlist } from '../controllers/public.controller';

const router = express.Router();

router.post('/waitlist', joinWaitlist);

export default router;
