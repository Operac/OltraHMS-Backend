
import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { getMyGoals, createGoal, checkInGoal } from '../controllers/wellness.controller';

const router = Router();

router.use(authenticate);

router.get('/', getMyGoals);
router.post('/', createGoal);
router.patch('/:id/checkin', checkInGoal);

export default router;
