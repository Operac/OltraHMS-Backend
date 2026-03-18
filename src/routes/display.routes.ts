import { Router } from 'express';
import { getQueueDisplay, getDoctorDisplay } from '../controllers/display.controller';

const router = Router();

// Public endpoints for display screens (no auth required)
// Get all queue display
router.get('/', getQueueDisplay);

// Get queue display for specific department
router.get('/department/:departmentId', getQueueDisplay);

// Get single doctor display (for individual screens)
router.get('/doctor/:doctorId', getDoctorDisplay);

export default router;
