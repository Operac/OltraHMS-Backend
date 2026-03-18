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
import { sessionMiddleware, startSessionCleanup } from './middleware/session.middleware';
import videoRoutes from './routes/video.routes';
import chatRoutes from './routes/chat.routes';
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
import settingsRoutes from './routes/settings.routes';
import wellnessRoutes from './routes/wellness.routes';
import patientExperienceRoutes from './routes/patient-experience.routes';
import queueRoutes from './routes/queue.routes';
import displayRoutes from './routes/display.routes';

const app = express();

// HTTPS redirect for production (must be after app is created)
if (process.env.NODE_ENV === 'production') {
    app.use((req: any, res: any, next: any) => {
        if (req.header('x-forwarded-proto') !== 'https') {
            res.redirect(`https://${req.header('host')}${req.url}`);
        } else {
            next();
        }
    });
}

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

// Configure Helmet with explicit security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
        },
    },
    hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
    },
    xssFilter: true,
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
}));

// CORS configuration - only allow localhost in development
const isDevelopment = process.env.NODE_ENV !== 'production';
const allowedOrigins = isDevelopment
    ? [
        process.env.FRONTEND_URL || "http://localhost:5173", 
        "http://localhost:5173", 
        "http://localhost:3000",
        "http://localhost:5174"
      ]
    : process.env.FRONTEND_URL
      ? [process.env.FRONTEND_URL]
      : [];

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));
app.use(express.json());

// Session middleware for timeout tracking
app.use(sessionMiddleware);

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
app.use('/api/video', videoRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/wellness', wellnessRoutes);
app.use('/api/admissions', admissionRoutes);
app.use('/api/wards', wardRoutes);
app.use('/api/patient', patientExperienceRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/display', displayRoutes);

app.get('/', (req, res) => {
  res.send('OltraHMS Backend is running');
});

// Global Error Handler for Express
app.use((err: any, req: any, res: any, next: any) => {
    console.error('🔥 Global Error Caught:', err);
    
    // Handle different error types
    if (err.name === 'ValidationError') {
        return res.status(400).json({ 
            success: false,
            message: 'Validation Error', 
            errors: err.errors 
        });
    }
    
    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({ 
            success: false,
            message: 'Unauthorized access' 
        });
    }
    
    // Don't leak internal error details in production
    const message = process.env.NODE_ENV === 'production' 
        ? 'An unexpected error occurred' 
        : err.message || 'Unknown error';
    
    res.status(err.status || 500).json({ 
        success: false,
        message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
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

// Start session cleanup
startSessionCleanup();

export { app, io };