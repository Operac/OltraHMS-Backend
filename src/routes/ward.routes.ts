import { Router } from 'express';
import { getWards, createWard, createBed, deleteWard, deleteBed, updateBedStatus } from '../controllers/ward.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Protect all routes for Admin and Accountant
router.use(authenticate, authorize(['ADMIN', 'ACCOUNTANT']));

router.get('/', getWards);
router.post('/', createWard);
router.delete('/:id', deleteWard);

router.post('/beds', createBed);
router.delete('/beds/:id', deleteBed);
router.patch('/beds/:id/status', updateBedStatus);

export default router;
