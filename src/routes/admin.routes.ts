import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { Role } from '@prisma/client';
import { getSystemStats, getAllStaff, createStaff, updateStaffStatus, getAuditLogs, getStaffDetails, deleteStaff, updateStaffHRDetails } from '../controllers/admin.controller';

const router = Router();

// Stats
router.get('/stats', authenticate as any, authorize([Role.ADMIN] as any) as any, getSystemStats as any);

// Staff Management
router.get('/staff', authenticate as any, authorize([Role.ADMIN] as any) as any, getAllStaff as any);
router.post('/staff', authenticate as any, authorize([Role.ADMIN] as any) as any, createStaff as any);
router.get('/staff/:userId', authenticate as any, authorize([Role.ADMIN] as any) as any, getStaffDetails as any);
router.delete('/staff/:userId', authenticate as any, authorize([Role.ADMIN] as any) as any, deleteStaff as any);
router.patch('/staff/:userId/status', authenticate as any, authorize([Role.ADMIN] as any) as any, updateStaffStatus as any);
router.put('/staff/:staffId/hr-details', authenticate as any, authorize([Role.ADMIN] as any) as any, updateStaffHRDetails as any);

// Logs
router.get('/audit-logs', authenticate as any, authorize([Role.ADMIN] as any) as any, getAuditLogs as any);

export default router;
