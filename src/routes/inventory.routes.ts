import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getInventoryStatus, receiveStock, getLowStockAlerts } from '../controllers/inventory.controller';

const router = Router();

// Retrieve all stock
router.get('/', authenticate, authorize(['PHARMACIST', 'ADMIN']), getInventoryStatus);

// Receive new stock (PO)
router.post('/receive', authenticate, authorize(['PHARMACIST', 'ADMIN']), receiveStock);

// Alerts
router.get('/alerts/low-stock', authenticate, authorize(['PHARMACIST', 'ADMIN']), getLowStockAlerts);

export default router;
