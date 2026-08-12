import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { apiLimiter, authLimiter } from './middleware/rateLimiter.middleware';
import { authenticate } from './middleware/auth.middleware';
import { rejectUnsafeInput } from './middleware/requestSafety.middleware';
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
import authRoutes from './routes/auth.routes';

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
import triageRoutes from './routes/triage.routes';
import insuranceClaimRoutes from './routes/insurance-claim.routes';
import insuranceRoutes from './routes/insurance.routes';
import expenseRoutes from './routes/expense.routes';

const app = express();

// Compute allowed origins once for both CORS and Socket.io
const isDevelopment = process.env.NODE_ENV !== 'production';
const allowedOrigins = isDevelopment
    ? [
        process.env.FRONTEND_URL || "http://localhost:5173",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:5174"
      ]
    : process.env.FRONTEND_URL
    ? [process.env.FRONTEND_URL, "https://oltra-hms-frontend.vercel.app"]
    : ["https://oltra-hms-frontend.vercel.app"];

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
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    }
});

setupSocketHandlers(io);

const PORT = process.env.PORT || 3000;

// Configure Helmet with explicit security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https:"],  // unsafe-inline needed for Tailwind runtime styles
            scriptSrc: ["'self'", "https:"],                     // removed unsafe-inline for scripts
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https:", "wss:", "http://localhost:3000"],
            fontSrc: ["'self'", "https:", "data:"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'", "https:"],
            frameSrc: ["'self'", "https://meet.jit.si"],          // allow Jitsi iframes for telemedicine
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
    },
    dnsPrefetchControl: { allow: false },
    hidePoweredBy: true,
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    xssFilter: true,
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
}));

app.use(cors({
    origin: allowedOrigins,
    credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(rejectUnsafeInput);

// ============================================
// PUBLIC ROUTES (No authentication required)
// ============================================

// Auth routes - have their own rate limiter
app.use('/api/auth', authLimiter, authRoutes);

// Public routes - general rate limiting only
app.use('/api/public', apiLimiter, publicRoutes);

app.get('/', (req, res) => {
  res.send('OltraHMS Backend is running');
});

// ============================================
// PROTECTED ROUTES (Authentication required)
// ============================================

// Apply authentication globally for all routes below
app.use(authenticate);

// Apply session middleware only for authenticated requests
app.use(sessionMiddleware);

// Apply general API rate limiter to protected routes
app.use(apiLimiter);

// Protected API routes - all require authentication
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
app.use('/api/patient-experience', patientExperienceRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/display', displayRoutes);
app.use('/api/triage', triageRoutes);
app.use('/api/insurance-claim', insuranceClaimRoutes);
app.use('/api/insurance', insuranceRoutes);
app.use('/api/expenses', expenseRoutes);

// ============================================
// 404 NOT FOUND HANDLER
// ============================================
app.use((req, res) => {
  res.status(404).json({ 
    success: false, 
    message: 'Endpoint not found',
    path: req.path
  });
});

// ============================================
// GLOBAL ERROR HANDLER
// ============================================
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

// ============================================
// PREVENT UNHANDLED REJECTIONS & EXCEPTIONS
// ============================================
process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception:', error);
});

// ============================================
// GRACEFUL SHUTDOWN HANDLER
// ============================================
let isShuttingDown = false;

const shutdownServer = () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    
    console.log('⏹️  Shutting down gracefully...');
    
    // Stop accepting new connections
    httpServer.close(() => {
        console.log('✅ HTTP server closed');
        process.exit(0);
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
        console.error('❌ Forced shutdown after 10 seconds');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', shutdownServer);
process.on('SIGINT', shutdownServer);

// ============================================
// START SERVER
// ============================================
// Socket.io connection managed by socket.handler.ts

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Start session cleanup
startSessionCleanup();

export { app, io };
