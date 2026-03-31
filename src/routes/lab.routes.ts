import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getPendingOrders, updateOrderStatus, uploadResult, createInvoice, submitPayment, clearPayment, waivePayment } from '../controllers/lab.controller';
import multer from 'multer';
import { CloudinaryStorage } from 'multer-storage-cloudinary';
import cloudinary from '../config/cloudinary';

const router = Router();

// Configure Multer Storage for Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'oltrams-lab-results',
        allowed_formats: ['jpg', 'png', 'pdf'],
        resource_type: 'auto'
    } as any
});

const upload = multer({ storage: storage });

router.use(authenticate);

// List pending orders (Lab Techs, Doctors)
router.get('/orders/pending', authorize(['LAB_TECH', 'DOCTOR', 'ADMIN']), getPendingOrders);

// Update status
router.patch('/orders/:id/status', authorize(['LAB_TECH', 'ADMIN']), updateOrderStatus);

// Upload result (File + Data)
router.post('/orders/:id/result', authorize(['LAB_TECH', 'ADMIN']), upload.single('file'), uploadResult);

// Create invoice
router.post('/orders/:id/invoice', authorize(['LAB_TECH', 'ADMIN', 'ACCOUNTANT']), createInvoice);

// Payment gate endpoints
router.post('/orders/:id/submit-payment', authorize(['PATIENT']), submitPayment);
router.post('/orders/:id/clear-payment', authorize(['ADMIN', 'ACCOUNTANT', 'RECEPTIONIST']), clearPayment);
router.post('/orders/:id/waive-payment', authorize(['ADMIN']), waivePayment);

export default router;
