
import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getTests, createRequest, getRequests, addReport } from '../controllers/radiology.controller';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary';

const router = Router();

// Configure Multer Storage for Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'oltrahms-radiology',
        allowed_formats: ['jpg', 'png', 'jpeg', 'pdf'],
        resource_type: 'auto'
    } as any
});

const upload = multer({ storage: storage });

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
