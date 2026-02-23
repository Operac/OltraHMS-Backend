
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getTheaters, scheduleSurgery, getSchedule, updateStatus } from '../controllers/surgery.controller';

const router = Router();

router.use(authenticate);

// Get all Theaters (Public to staff)
router.get('/theaters', getTheaters);

// Schedule Surgery (Doctor, Admin)
router.post('/cases', authorize(['DOCTOR', 'ADMIN']), scheduleSurgery);

// Get Schedule (Staff)
router.get('/cases', getSchedule);

// Update Status (Doctor, Admin, Nurse - primarily for tracking)
router.patch('/cases/:id/status', authorize(['DOCTOR', 'ADMIN', 'NURSE']), updateStatus);

export default router;
