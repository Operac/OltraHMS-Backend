// @ts-nocheck
import axios from 'axios';
import { prisma } from '../src/lib/prisma';
import bcrypt from 'bcryptjs';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const PASSWORD = 'password123';

async function ensureUser(email: string, role: string, firstName: string, lastName: string, additionalData: any = {}) {
    let user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        console.log(`Creating ${role}: ${email}`);
        const hashedPassword = await bcrypt.hash(PASSWORD, 10);
        user = await prisma.user.create({
            data: {
                email,
                passwordHash: hashedPassword,
                role: role as any,
                firstName,
                lastName,
                status: 'ACTIVE'
            }
        });
    }

    // Ensure Profile
    if (role === 'DOCTOR') {
        const staff = await prisma.staff.findUnique({ where: { userId: user.id } });
        if (!staff) {
            await prisma.staff.create({
                data: {
                    userId: user.id,
                    staffNumber: `DOC-${Date.now()}`,
                    specialization: 'General',
                    hireDate: new Date(),
                    ...additionalData
                }
            });
        }
    } else if (role === 'PATIENT') {
        const patient = await prisma.patient.findUnique({ where: { userId: user.id } });
        if (!patient) {
            await prisma.patient.create({
                data: {
                    userId: user.id,
                    patientNumber: `HMS-${Date.now()}`,
                    firstName,
                    lastName,
                    dateOfBirth: new Date('1990-01-01'),
                    gender: 'MALE',
                    phone: '555-0000',
                    ...additionalData
                }
            });
        }
    }
    return user;
}

const login = async (email: string, role: string) => {
    try {
        const res = await axios.post(`${API_URL}/auth/login`, {
            email,
            password: PASSWORD
        });
        return res.data;
    } catch (error: any) {
        console.error(`Login failed for ${role}:`, error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
        throw error;
    }
};

async function verifyTelemedicineFlow() {
    console.log('🚀 Starting Telemedicine Verification...');
    console.log(`Targeting API: ${API_URL}`);

    try {
        // 1. Setup Users
        await ensureUser('tele.patient@test.com', 'PATIENT', 'Tele', 'Patient');
        await ensureUser('tele.doctor@test.com', 'ADMIN', 'Tele', 'Doctor'); 
        // Note: Using ADMIN role for doctor acting user if 'DOCTOR' role has issues, 
        // but let's try 'DOCTOR' if the system supports it. 
        // Wait, schema says Role enum has DOCTOR? 
        // Let's check schema/enums. Valid roles: PATIENT, DOCTOR, NURSE, ADMIN, PHARMACIST, LAB_TECHNICIAN, RECEPTIONIST.
        await ensureUser('tele.real.doctor@test.com', 'DOCTOR', 'Real', 'Doc');

        // 2. Login
        const patientAuth = await login('tele.patient@test.com', 'PATIENT');
        const patientToken = patientAuth.token;
        
        const doctorAuth = await login('tele.real.doctor@test.com', 'DOCTOR');
        const doctorToken = doctorAuth.token;
        // Doctor needs a staff profile for appointments
        const doctorUser = await prisma.user.findUnique({ 
            where: { email: 'tele.real.doctor@test.com' },
            include: { staff: true }
        });

        if (!doctorUser?.staff) throw new Error('Doctor staff profile missing');
        const doctorId = doctorUser.staff.id;

        console.log('✅ Logged in Patient & Doctor');

        // 3. Book Appointment
        console.log('📅 Booking Telemedicine Appointment...');
        const startTime = new Date();
        startTime.setHours(startTime.getHours() + 1);
        const endTime = new Date(startTime);
        endTime.setMinutes(endTime.getMinutes() + 30);

        const bookingRes = await axios.post(`${API_URL}/appointments`, {
            doctorId: doctorId,
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            type: 'TELEMEDICINE',
            reason: 'Verification Test Call'
        }, { headers: { Authorization: `Bearer ${patientToken}` } });

        const appointmentId = bookingRes.data.id;
        console.log(`✅ Appointment Booked: ${appointmentId}`);

        // 4. Create Video Session (Doctor initiates)
        console.log('📹 creating Video Session...');
        const sessionRes = await axios.post(`${API_URL}/video/sessions`, {
            appointmentId
        }, { headers: { Authorization: `Bearer ${doctorToken}` } });

        if (sessionRes.data.status !== 'ACTIVE') throw new Error('Session not active');
        console.log('✅ Video Session Created via API');

        // 5. End Session
        console.log('🛑 Ending Session...');
        await axios.post(`${API_URL}/video/sessions/end`, {
            appointmentId
        }, { headers: { Authorization: `Bearer ${doctorToken}` } });
        console.log('✅ Session Ended');

        // Cleanup
        console.log('🧹 Cleaning Up...');
        await prisma.videoSession.deleteMany({ where: { appointmentId } });
        await prisma.appointment.delete({ where: { id: appointmentId } });
        // Keeping users for future runs or manual testing

        console.log('✨ Telemedicine Flow Verified Successfully!');

    } catch (error: any) {
        console.error('❌ Verification Failed:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data));
        }
        process.exit(1);
    }
}

verifyTelemedicineFlow();
