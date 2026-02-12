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
import dashboardRoutes from './routes/dashboard.routes';
import labRoutes from './routes/lab.routes';
import prescriptionRoutes from './routes/prescription.routes';
import billingRoutes from './routes/billing.routes';
import doctorRoutes from './routes/doctor.routes';
import receptionistRoutes from './routes/receptionist.routes';
import publicRoutes from './routes/public.routes';

import { setupSocketHandlers } from './socket/socket.handler';
import videoRoutes from './routes/video.routes';

// Existing imports...
import adminRoutes from './routes/admin.routes';
import inventoryRoutes from './routes/inventory.routes';
import pharmacyRoutes from './routes/pharmacy.routes';
import inpatientRoutes from './routes/inpatient.routes';

const app = express();
const httpServer = createServer(app);

// Socket.io Setup
const io: any = new Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:5173", // Frontend URL
        methods: ["GET", "POST"]
    }
});

setupSocketHandlers(io);

const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
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
app.use('/api/video', videoRoutes);

app.get('/', (req, res) => {
  res.send('OltraHMS Backend is running');
});

// Socket.io connection managed by socket.handler.ts

httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export { app, io };