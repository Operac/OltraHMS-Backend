
import { 
    getMedicalRecords, 
    getInvoices, 
    processPayment, 
    initializeVideoSession, 
    getQueueStatus,
    getEmergencyProfile
} from '../src/controllers/patient-experience.controller';
import { PrismaClient } from '@prisma/client';
import { Request, Response } from 'express';

const prisma = new PrismaClient();

// Mock Express Request/Response
const mockResponse = () => {
    const res: any = {};
    res.status = (code: number) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data: any) => {
        res.data = data;
        return res;
    };
    return res;
};

const mockRequest = (userId: string, body: any = {}, params: any = {}) => {
    return {
        user: { id: userId, role: 'PATIENT' },
        body,
        params
    } as any;
};

async function main() {
    console.log('--- Starting Patient Experience Verification ---');

    // 1. Setup: Ensure a Patient exists
    const userEmail = `test.patient.${Date.now()}@example.com`;
    console.log(`Creating test user: ${userEmail}`);

    const user = await prisma.user.create({
        data: {
            email: userEmail,
            passwordHash: 'hashedpassword',
            role: 'PATIENT',
            firstName: 'Test',
            lastName: 'Patient'
        }
    });

    const patient = await prisma.patient.create({
        data: {
            userId: user.id,
            patientNumber: `HMS-TEST-${Date.now()}`,
            firstName: 'Test',
            lastName: 'Patient',
            dateOfBirth: new Date(),
            gender: 'MALE',
            phone: '1234567890'
        }
    });

    try {
        // --- Test 1: Emergency Profile ---
        console.log('\nTest 1: getEmergencyProfile');
        {
            const req = mockRequest(user.id);
            const res = mockResponse();
            await getEmergencyProfile(req, res);
            if (res.data && res.data.firstName === 'Test') console.log('✅ Passed');
            else console.error('❌ Failed', res.data);
        }

        // --- Test 2: Medical Records (Empty) ---
        console.log('\nTest 2: getMedicalRecords');
        {
            const req = mockRequest(user.id);
            const res = mockResponse();
            await getMedicalRecords(req, res);
            if (res.data && Array.isArray(res.data.history)) console.log('✅ Passed');
            else console.error('❌ Failed', res.data);
        }

        // --- Test 3: Create Inquiry & Telemedicine Session ---
        console.log('\nTest 3: initializeVideoSession');
        // Setup: Need an appointment first
        const doctorUser = await prisma.user.create({
           data: { email: `doc.${Date.now()}@test.com`, passwordHash: 'pw', role: 'DOCTOR', firstName: 'Doc', lastName: 'Test' } 
        });
        const doctor = await prisma.staff.create({
            data: { 
                userId: doctorUser.id, 
                staffNumber: `DOC-${Date.now()}`, 
                departmentId: 'General', 
                hireDate: new Date()
            }
        });

        const appointment = await prisma.appointment.create({
           data: {
               patientId: patient.id,
               doctorId: doctor.id, 
               appointmentDate: new Date(),
               startTime: new Date(),
               endTime: new Date(),
               type: 'FIRST_VISIT',
               status: 'CONFIRMED'
           }
        });

        {
            const req = mockRequest(user.id, { appointmentId: appointment.id });
            const res = mockResponse();
            await initializeVideoSession(req, res);
            if (res.data && res.data.sessionId && res.data.token) console.log('✅ Passed');
            else console.error('❌ Failed', res.data);
        }

        // --- Test 4: Queue Status ---
        console.log('\nTest 4: getQueueStatus');
        {
            const req = mockRequest(user.id); // Looks for active appt
            const res = mockResponse();
            await getQueueStatus(req, res);
            // Expecting either null (no active running appt) or status
            // Since we just created a CONFIRMED one (not CHECKED_IN/IN_PROGRESS), it might return 'No active appointment' or similar logic
            // Let's verify it doesn't crash
            if (res.statusCode !== 500) console.log('✅ Passed (Status Code: ' + (res.statusCode || 200) + ')');
            else console.error('❌ Failed', res.data);
        }

        // --- Test 5: processPayment ---
        console.log('\nTest 5: processPayment');
        // Setup: Create Invoice
        const invoice = await prisma.invoice.create({
            data: {
                patientId: patient.id,
                invoiceNumber: `INV-${Date.now()}`,
                items: [{ description: "Consultation", amount: 100 }],
                subtotal: 100.0,
                tax: 0,
                total: 100.0,
                balance: 100.0,
                status: 'ISSUED'
            }
        });

        {
            const req = mockRequest(user.id, { 
                invoiceId: invoice.id, 
                amount: 50, 
                method: 'CARD', 
                reference: 'REF-TEST-123' 
            });
            const res = mockResponse();
            await processPayment(req, res);
            
            if (res.data && res.data.message === 'Payment successful') {
                const updatedInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
                if (updatedInvoice?.status === 'PARTIAL' && updatedInvoice.amountPaid === 50) {
                     console.log('✅ Passed (Partial Payment Verified)');
                } else {
                     console.error('❌ Failed Logic');
                }
            } else {
                console.error('❌ Failed', res.data);
            }
        }

    } catch (e) {
        console.error('Test Suite Failed:', e);
    } finally {
        // Cleanup if needed, or rely on distinct test db
        await prisma.$disconnect();
    }
}

main();
