
import express from 'express';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { 
    getScheduledMedications, 
    logMedicationAdministration, 
    logFluidBalance, 
    getPatientCharts,
    addWardRoundNote,
    getWardRounds,
    createDepositInvoice
} from '../controllers/inpatient.controller';

const router = express.Router();

// NURSE ROUTES
router.get('/medications', authenticate, authorize(['NURSE', 'DOCTOR', 'ADMIN']), getScheduledMedications);
router.post('/medications/log', authenticate, authorize(['NURSE', 'ADMIN']), logMedicationAdministration);
router.post('/fluids', authenticate, authorize(['NURSE', 'DOCTOR', 'ADMIN']), logFluidBalance);
router.get('/charts/:patientId', authenticate, authorize(['NURSE', 'DOCTOR', 'ADMIN']), getPatientCharts);

// DOCTOR ROUTES
router.post('/rounds', authenticate, authorize(['DOCTOR', 'ADMIN']), addWardRoundNote);
router.get('/rounds/:admissionId', authenticate, authorize(['DOCTOR', 'NURSE', 'ADMIN']), getWardRounds);

// FINANCE / ADMISSION
router.post('/deposit', authenticate, authorize(['ADMIN', 'RECEPTIONIST', 'ACCOUNTANT']), createDepositInvoice);

export default router;
