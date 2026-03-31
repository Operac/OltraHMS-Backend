import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
    getPendingVerifications,
    getPatientInsurance,
    approveInsurance,
    rejectInsurance,
    getVerificationStats,
    getInsuranceProviders
} from '../controllers/insurance-verification.controller';

const router = Router();

// Stats
router.get('/verification/stats', authenticate as any, authorize(['ADMIN', 'RECEPTIONIST', 'ACCOUNTANT']) as any, getVerificationStats as any);

// Pending list
router.get('/verification/pending', authenticate as any, authorize(['ADMIN', 'RECEPTIONIST', 'ACCOUNTANT']) as any, getPendingVerifications as any);

// Patient's insurance
router.get('/verification/patient/:patientId', authenticate as any, getPatientInsurance as any);

// Approve / Reject
router.post('/verification/:id/approve', authenticate as any, authorize(['ADMIN', 'RECEPTIONIST', 'ACCOUNTANT']) as any, approveInsurance as any);
router.post('/verification/:id/reject', authenticate as any, authorize(['ADMIN', 'RECEPTIONIST', 'ACCOUNTANT']) as any, rejectInsurance as any);

// Provider list
router.get('/providers', authenticate as any, getInsuranceProviders as any);

export default router;
