import { Router } from 'express';
import { 
    getInsurancePolicies, 
    addInsurancePolicy, 
    verifyInsurance,
    updateInsurancePolicy,
    deleteInsurancePolicy,
    getAllPatientInsurance,
    getMedicationAdherence, 
    logMedicationTaken, 
    rescheduleAppointment, 
    cancelAppointment, 
    getDependents, 
    addDependent,
    removeDependent,
    getMedicalRecords,
    getLabResults,
    getPrescriptions,
    requestRefill,
    getInvoices,
    getWellnessGoals,
    updateWellnessGoal,
    submitFeedback,
    getNotifications,
    markNotificationRead,
    getQueueStatus,
    getEmergencyProfile,
    updateEmergencyProfile,
    initializeVideoSession
} from '../controllers/patient-experience.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Routes accessible by PATIENT only (and ADMIN maybe)
router.use(authenticate);

// Staff-wide insurance view must be declared before the patient-only guard.
router.get('/insurance/all', authorize(['ADMIN', 'RECEPTIONIST', 'ACCOUNTANT', 'INSURANCE_OFFICER']) as any, getAllPatientInsurance);

router.use(authorize(['PATIENT', 'ADMIN']));

// Medical Records
router.get('/medical-records', getMedicalRecords);
router.get('/lab-results', getLabResults);
router.get('/prescriptions', getPrescriptions);
router.post('/prescriptions/refill', requestRefill);
router.post('/prescriptions/:prescriptionId/refill', requestRefill);

// Billing
router.get('/invoices', getInvoices);

// Wellness
router.get('/wellness/goals', getWellnessGoals);
router.post('/wellness/goals', updateWellnessGoal);

// Feedback
router.post('/feedback', submitFeedback);

// Insurance
router.get('/insurance', getInsurancePolicies);
router.post('/insurance', addInsurancePolicy);
router.patch('/insurance/:id', updateInsurancePolicy);
router.delete('/insurance/:id', deleteInsurancePolicy);
router.patch('/insurance/:insuranceId/verify', verifyInsurance);

// Medications
router.get('/medications/adherence', getMedicationAdherence);
router.post('/medications/log', logMedicationTaken);

// Appointments & Real-time
router.patch('/appointments/:id/reschedule', rescheduleAppointment);
router.patch('/appointments/:id/cancel', cancelAppointment);
router.get('/queue-status', getQueueStatus);

// Family
router.get('/dependents', getDependents);
router.post('/dependents', addDependent);
router.delete('/dependents/:id', removeDependent);

// Notifications
router.get('/notifications', getNotifications);
router.patch('/notifications/:id/read', markNotificationRead);

// Emergency
router.get('/emergency-profile', getEmergencyProfile);
router.put('/emergency-profile', updateEmergencyProfile);


// Telemedicine
router.post('/telemedicine/session', initializeVideoSession);

export default router;
