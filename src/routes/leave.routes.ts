import { Router } from 'express';
import { requestLeave, updateLeaveStatus, getAllLeaves, getMyLeaves, getConflictingLeaves } from '../controllers/leave.controller';
import { getLeaveTypes, createLeaveType, updateLeaveType, deleteLeaveType } from '../controllers/leave-type.controller';
import { getStaffBalances, updateStaffBalance } from '../controllers/leave-balance.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Staff Actions
router.post('/request', authenticate, requestLeave);
router.get('/my', authenticate, getMyLeaves);
router.get('/my/balances', authenticate, (req: any, res) => {
   req.params.staffId = req.user.id;
   getStaffBalances(req, res);
});

// Admin / HR Actions
router.get('/', authenticate, authorize(['ADMIN', 'DOCTOR']), getAllLeaves); 
router.patch('/:id/status', authenticate, authorize(['ADMIN', 'DOCTOR']), updateLeaveStatus);
router.get('/:id/conflicts', authenticate, authorize(['ADMIN', 'DOCTOR']), getConflictingLeaves);

// Leave Types configuration (Admin only)
router.get('/types', authenticate, getLeaveTypes); // Everyone can view
router.post('/types', authenticate, authorize(['ADMIN']), createLeaveType);
router.patch('/types/:id', authenticate, authorize(['ADMIN']), updateLeaveType);
router.delete('/types/:id', authenticate, authorize(['ADMIN']), deleteLeaveType);

// Leave Balances assignment (Admin only)
router.get('/balances/:staffId', authenticate, authorize(['ADMIN']), getStaffBalances);
router.put('/balances/:staffId/:leaveTypeId', authenticate, authorize(['ADMIN']), updateStaffBalance);

export default router;
