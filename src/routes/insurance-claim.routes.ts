import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
    createClaim,
    getClaims,
    getClaimById,
    updateClaim,
    submitClaim,
    getClaimStats,
    getClaimByInvoice
} from '../controllers/insurance-claim.controller';

const router = Router();

router.use(authenticate);

// Accountants, Insurance Officers, and Admins can manage claims
const claimRoles = ['ACCOUNTANT', 'INSURANCE_OFFICER', 'ADMIN'] as any;

router.get('/stats/summary', authorize(claimRoles) as any, getClaimStats as any);
router.get('/', authorize(claimRoles) as any, getClaims as any);
router.get('/invoice/:invoiceId', authorize(claimRoles) as any, getClaimByInvoice as any);
router.get('/:id', authorize(claimRoles) as any, getClaimById as any);
router.post('/', authorize(claimRoles) as any, createClaim as any);
router.patch('/:id', authorize(claimRoles) as any, updateClaim as any);
router.post('/:id/submit', authorize(claimRoles) as any, submitClaim as any);

export default router;
