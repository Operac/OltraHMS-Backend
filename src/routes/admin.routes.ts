import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import { getSystemStats, getAllStaff, createStaff, updateStaffStatus, getAuditLogs, getStaffDetails, deleteStaff } from '../controllers/admin.controller';

const router = Router();

// Stats
router.get('/stats', authenticate, authorize([Role.ADMIN] as any), getSystemStats);

// Staff Management
router.get('/staff', authenticate, authorize([Role.ADMIN] as any), getAllStaff);
router.post('/staff', authenticate, authorize([Role.ADMIN] as any), createStaff);
router.get('/staff/:userId', authenticate, authorize([Role.ADMIN] as any), getStaffDetails);
router.delete('/staff/:userId', authenticate, authorize([Role.ADMIN] as any), deleteStaff);
router.patch('/staff/:userId/status', authenticate, authorize([Role.ADMIN] as any), updateStaffStatus);

// Logs
router.get('/audit-logs', authenticate, authorize([Role.ADMIN] as any), getAuditLogs);

export default router;
