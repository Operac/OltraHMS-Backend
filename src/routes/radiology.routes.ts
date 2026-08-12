
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getTests, createRequest, getRequests, addReport } from '../controllers/radiology.controller';
import { createCloudinaryUpload } from '../lib/cloudinaryUpload';

const router = Router();

const upload = createCloudinaryUpload('oltrahms-radiology');

router.use(authenticate);

// Public (authenticated) - View available tests
router.get('/tests', getTests);

// Doctor - Create Request
router.post('/requests', authorize(['DOCTOR', 'ADMIN']), createRequest);

// Radiologist/Doctor/Admin - View Worklist
router.get('/requests', authorize(['DOCTOR', 'ADMIN', 'LAB_TECH', 'RADIOLOGIST']), getRequests);

// Radiologist/Lab Tech - Add Report (with images)
// Upload up to 5 images
router.post('/requests/:requestId/report', authorize(['DOCTOR', 'ADMIN', 'LAB_TECH', 'RADIOLOGIST']), upload.array('images', 5), addReport);

export default router;
