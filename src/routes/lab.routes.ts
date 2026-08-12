import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getPendingOrders, updateOrderStatus, uploadResult, createInvoice, submitPayment, clearPayment, waivePayment } from '../controllers/lab.controller';
import { createCloudinaryUpload } from '../lib/cloudinaryUpload';

const router = Router();

const upload = createCloudinaryUpload('oltrahms-lab-results');

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
