import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { 
    getAllDepartments, 
    createDepartment, 
    updateDepartment, 
    deleteDepartment 
} from '../controllers/department.controller';
import { Role } from '@prisma/client';

const router = Router();

// All routes require authentication
router.use(authenticate as any);

// Get all - Accessible by Admin, Doctor, HR, etc. (Adjust roles as needed)
router.get('/', getAllDepartments as any);

// Manage - Admin only
router.post('/', authorize([Role.ADMIN]) as any, createDepartment as any);
router.put('/:id', authorize([Role.ADMIN]) as any, updateDepartment as any);
router.delete('/:id', authorize([Role.ADMIN]) as any, deleteDepartment as any);

export default router;
