import axios from 'axios';
import { PrismaClient, Role, AppointmentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../.env') });

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3000/api';

async function verifyReceptionistFlow() {
    console.log('🏥 Starting Receptionist Flow Verification...');
    let receptionistToken = '';
    let doctorId = '';
    let patientId = '';
    let appointmentId = '';

    try {
        // 1. Setup Data - Receptionist & Doctor
        console.log('\n1. Setting up Test Data...');
        
        // Ensure Receptionist Exists
        const receptionistEmail = 'recept_test@oltra.com';
        let receptionist = await prisma.user.findUnique({ where: { email: receptionistEmail } });
        if (!receptionist) {
             const passwordHash = await bcrypt.hash('password123', 10);
             receptionist = await prisma.user.create({
                 data: {
                     email: receptionistEmail,
                     passwordHash: passwordHash,
                     role: Role.RECEPTIONIST,
                     firstName: 'Receptionist',
                     lastName: 'Test',
                     staff: {
                         create: {
                             staffNumber: 'REC-' + Date.now(),
                             departmentId: 'Front Desk',
                             hireDate: new Date()
                         }
                     }
                 }
             });
             console.log('   - Created Receptionist');
        }

        // Ensure Doctor Exists (for booking)
        const doctorEmail = 'doc_test_recep@oltra.com';
        let doctorUser = await prisma.user.findUnique({ where: { email: doctorEmail } });
        let doctorStaff: any;
        
        if (!doctorUser) {
             const passwordHash = await bcrypt.hash('password123', 10);
             const newUser = await prisma.user.create({
                 data: {
                     email: doctorEmail,
                     passwordHash: passwordHash,
                     role: Role.DOCTOR,
                     firstName: 'Doc',
                     lastName: 'Recep',
                     staff: {
                         create: {
                             staffNumber: 'DOC-' + Date.now(),
                             specialization: 'General Practice',
                             licenseNumber: 'R-12345',
                             hireDate: new Date()
                         }
                     }
                 },
                 include: { staff: true }
             });
             doctorStaff = newUser.staff;
             console.log('   - Created Doctor');
        } else {
            doctorStaff = await prisma.staff.findUnique({ where: { userId: doctorUser.id } });
        }
        
        if (!doctorStaff) throw new Error('Doctor staff profile not found');
        doctorId = doctorStaff.id;

        // Login
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: receptionistEmail,
            password: 'password123'
        });
        receptionistToken = (loginRes.data as any).token;
        console.log('   - Receptionist Logged In');


        // 2. Register Patient
        console.log('\n2. Testing Patient Registration...');
        const newPatientData = {
            firstName: 'Test',
            lastName: `Patient_${Date.now()}`,
            phone: '555-0199',
            dateOfBirth: '1990-01-01',
            gender: 'MALE',
            address: '123 Test St'
        };

        const regRes = await axios.post(
            `${API_URL}/receptionist/patients`, 
            newPatientData,
            { headers: { Authorization: `Bearer ${receptionistToken}` } }
        );
        
        if (regRes.status === 201 && (regRes.data as any).patient) {
            console.log('   ✅ Patient Registered:', (regRes.data as any).patient.firstName);
            patientId = (regRes.data as any).patient.id;
        } else {
            throw new Error('Registration failed');
        }


        // 3. Search Patient
        console.log('\n3. Testing Patient Search...');
        const searchRes = await axios.get(
            `${API_URL}/receptionist/patients/search?query=${newPatientData.lastName}`,
            { headers: { Authorization: `Bearer ${receptionistToken}` } }
        );
        
        if (Array.isArray(searchRes.data) && (searchRes.data as any).length > 0) {
            console.log(`   ✅ Search found ${(searchRes.data as any).length} patient(s)`);
        } else {
            throw new Error('Search failed');
        }

        // 4. Book Appointment
        console.log('\n4. Testing Appointment Booking...');
        const startTime = new Date();
        startTime.setDate(startTime.getDate() + 1); // Tomorrow
        startTime.setHours(10, 0, 0, 0);

        const bookRes = await axios.post(
            `${API_URL}/receptionist/appointments`,
            {
                patientId,
                doctorId,
                startTime: startTime.toISOString(),
                type: 'FIRST_VISIT',
                notes: 'Initial checkup'
            },
            { headers: { Authorization: `Bearer ${receptionistToken}` } }
        );

        if (bookRes.status === 201) {
            console.log('   ✅ Appointment Booked:', (bookRes.data as any).id);
            appointmentId = (bookRes.data as any).id;
        } else {
            throw new Error('Booking failed');
        }

        // 5. Check-In Patient
        console.log('\n5. Testing Check-In...');
        const checkInRes = await axios.patch(
            `${API_URL}/receptionist/appointments/${appointmentId}/check-in`,
            {},
            { headers: { Authorization: `Bearer ${receptionistToken}` } }
        );

        if (checkInRes.status === 200) {
            console.log('   ✅ Patient Checked In');
        } else {
             throw new Error('Check-in failed');
        }

        // 6. Verify Dashboard Stats (Implicit via API call)
        console.log('\n6. Verifying Dashboard Listing...');
        const dashboardRes = await axios.get(
            `${API_URL}/receptionist/appointments/daily?date=${startTime.toISOString().split('T')[0]}`,
            { headers: { Authorization: `Bearer ${receptionistToken}` } }
        );
        
        const found = (dashboardRes.data as any).find((a: any) => a.id === appointmentId);
        if (found && found.status === 'CHECKED_IN') {
             console.log('   ✅ Dashboard reflects Correct Status (CHECKED_IN)');
        } else {
             throw new Error('Dashboard did not show updated status');
        }

        // 7. Test No Show
        console.log('\n7. Testing No-Show...');
        let noShowAppointmentId = '';
        const noShowRes = await axios.post(
            `${API_URL}/receptionist/appointments`,
            {
                patientId,
                doctorId,
                startTime: new Date(new Date().setDate(new Date().getDate() + 2)).toISOString(), // Day after tomorrow
                type: 'FIRST_VISIT',
                notes: 'To be missed'
            },
            { headers: { Authorization: `Bearer ${receptionistToken}` } }
        );
        noShowAppointmentId = (noShowRes.data as any).id;

        const markNoShowRes = await axios.patch(
            `${API_URL}/receptionist/appointments/${noShowAppointmentId}/no-show`,
            {},
            { headers: { Authorization: `Bearer ${receptionistToken}` } }
        );

        if (markNoShowRes.status === 200) {
             console.log('   ✅ Appointment Marked as No Show');
        } else {
             throw new Error('Mark No Show failed');
        }

        // Verify status
        const dashboardRes2 = await axios.get(
            `${API_URL}/receptionist/appointments/daily?date=${new Date(new Date().setDate(new Date().getDate() + 2)).toISOString().split('T')[0]}`,
            { headers: { Authorization: `Bearer ${receptionistToken}` } }
        );
        const foundNoShow = (dashboardRes2.data as any).find((a: any) => a.id === noShowAppointmentId);
        
        if (foundNoShow && foundNoShow.status === 'NO_SHOW') {
            console.log('   ✅ Dashboard reflects Correct Status (NO_SHOW)');
        } else {
             throw new Error('Dashboard did not update No Show status');
        }

        // Cleanup extra appointment
        await prisma.appointment.delete({ where: { id: noShowAppointmentId } });

        console.log('\n🎉 ALL RECEPTIONIST FLOWS PASSED!');

    } catch (error: any) {
        console.error('\n❌ Verification Failed:', error.message);
        if (error.response) {
            console.error('   API Error:', error.response.status, error.response.data);
        }
    } finally {
        // Cleanup
        if (appointmentId) await prisma.appointment.delete({ where: { id: appointmentId } });
        if (patientId) await prisma.patient.delete({ where: { id: patientId } });
        // Don't delete users to keep verification repeatable/faster, or delete if desired
        await prisma.$disconnect();
    }
}

verifyReceptionistFlow();
