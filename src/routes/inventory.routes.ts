import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { getInventoryStatus, receiveStock, getLowStockAlerts, createMedication } from '../controllers/inventory.controller';

const router = Router();

// Retrieve all stock
router.get('/', authenticate as any, authorize(['PHARMACIST', 'ADMIN']) as any, getInventoryStatus as any);

// Receive new stock (PO)
router.post('/receive', authenticate as any, authorize(['PHARMACIST', 'ADMIN']) as any, receiveStock as any);

// Alerts
router.get('/alerts/low-stock', authenticate as any, authorize(['PHARMACIST', 'ADMIN']) as any, getLowStockAlerts as any);

// Create Medication (Admin & Pharmacist)
router.post('/medications', authenticate as any, authorize(['ADMIN', 'PHARMACIST']) as any, createMedication as any);

export default router;
