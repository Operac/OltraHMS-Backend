import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import authRoutes from './routes/auth.routes';
import patientRoutes from './routes/patient.routes';
import appointmentRoutes from './routes/appointment.routes';
import medicalRecordRoutes from './routes/medical-record.routes';
import staffRoutes from './routes/staff.routes';
import wardRoutes from './routes/ward.routes';
import dashboardRoutes from './routes/dashboard.routes';
import labRoutes from './routes/lab.routes';
import prescriptionRoutes from './routes/prescription.routes';
import billingRoutes from './routes/billing.routes';
import doctorRoutes from './routes/doctor.routes';
import receptionistRoutes from './routes/receptionist.routes';
import publicRoutes from './routes/public.routes';

import { setupSocketHandlers } from './socket/socket.handler';
import videoRoutes from './routes/video.routes';
import notificationRoutes from './routes/notification.routes';

// Existing imports...
import adminRoutes from './routes/admin.routes';
import inventoryRoutes from './routes/inventory.routes';
import pharmacyRoutes from './routes/pharmacy.routes';
import inpatientRoutes from './routes/inpatient.routes';
import departmentRoutes from './routes/department.routes';
import reportRoutes from './routes/report.routes';
import vitalSignsRoutes from './routes/vital-signs.routes';
import admissionRoutes from './routes/admission.routes';
import financeRoutes from './routes/finance.routes';
import payrollRoutes from './routes/payroll.routes';
import leaveRoutes from './routes/leave.routes';
import radiologyRoutes from './routes/radiology.routes';
import surgeryRoutes from './routes/surgery.routes';
import chatRoutes from './routes/chat.routes';
import wellnessRoutes from './routes/wellness.routes';
import patientExperienceRoutes from './routes/patient-experience.routes';

const app = express();
const httpServer = createServer(app);

// Socket.io Setup
const io: any = new Server(httpServer, {
    cors: {
        origin: [
            process.env.FRONTEND_URL || "http://localhost:5173", 
            "http://localhost:5173", 
            "http://localhost:3000",
            "http://localhost:5174"
        ],
        methods: ["GET", "POST"],
        credentials: true
    }
});

setupSocketHandlers(io);

const PORT = process.env.PORT || 3000;

import helmet from 'helmet';

app.use(helmet());
app.use(cors({
    origin: [
        process.env.FRONTEND_URL || "http://localhost:5173", 
        "http://localhost:5173", 
        "http://localhost:3000",
        "http://localhost:5174"
    ],
    credentials: true
}));
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/medical-records', medicalRecordRoutes);
app.use('/api/labs', labRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/prescriptions', prescriptionRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/doctor', doctorRoutes);
app.use('/api/receptionist', receptionistRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/inpatient', inpatientRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/vitals', vitalSignsRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/radiology', radiologyRoutes);
app.use('/api/surgery', surgeryRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/wellness', wellnessRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/wards', wardRoutes);
app.use('/api/patient', patientExperienceRoutes);

app.get('/', (req, res) => {
  res.send('OltraHMS Backend is running');
});

// Global Error Handler for Express
app.use((err: any, req: any, res: any, next: any) => {
    console.error('🔥 Global Error Caught:', err);
    res.status(500).json({ message: 'Internal Server Error', error: err?.message || 'Unknown error' });
});

// Prevent Node process from crashing on unexpected errors (e.g. DB Drops)
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception:', error);
});

// Socket.io connection managed by socket.handler.ts

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app, io };