import { Router } from 'express';
import { 
    getInsurancePolicies, 
    addInsurancePolicy, 
    getMedicationAdherence, 
    logMedicationTaken, 
    rescheduleAppointment, 
    cancelAppointment, 
    getDependents, 
    addDependent,
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
    initializeVideoSession,
    processPayment
} from '../controllers/patient-experience.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';

const router = Router();

// Routes accessible by PATIENT only (and ADMIN maybe)
router.use(authenticate);
router.use(authorize(['PATIENT', 'ADMIN']));

// Medical Records
router.get('/medical-records', getMedicalRecords);
router.get('/lab-results', getLabResults);
router.get('/prescriptions', getPrescriptions);
router.post('/prescriptions/refill', requestRefill);

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

// Notifications
router.get('/notifications', getNotifications);
router.patch('/notifications/:id/read', markNotificationRead);

// Emergency
router.get('/emergency-profile', getEmergencyProfile);


// Telemedicine
router.post('/telemedicine/session', initializeVideoSession);

// Payments
router.post('/payments/process', processPayment);

export default router;
