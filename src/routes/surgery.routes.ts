
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getTheaters, scheduleSurgery, getSchedule, updateStatus, createTheater, updateTheater } from '../controllers/surgery.controller';

const router = Router();

router.use(authenticate);

// Get all Theaters (Public to staff)
router.get('/theaters', getTheaters);

// Create Theater (Admin)
router.post('/theaters', authorize(['ADMIN']), createTheater);

// Update Theater (Admin)
router.patch('/theaters/:id', authorize(['ADMIN']), updateTheater);

// Schedule Surgery (Doctor, Admin)
router.post('/cases', authorize(['DOCTOR', 'ADMIN']), scheduleSurgery);

// Get Schedule (Staff)
router.get('/cases', getSchedule);

// Update Status (Doctor, Admin, Nurse - primarily for tracking)
router.patch('/cases/:id/status', authorize(['DOCTOR', 'ADMIN', 'NURSE']), updateStatus);

export default router;
