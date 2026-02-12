
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3000/api';

async function main() {
    console.log('🧪 Starting Lab Workflow Verification...');

    try {
        // 1. Setup: Ensure we have a Doctor and a Patient
        const doctorEmail = 'gregory@oltrahms.com';
        const labEmail = 'lab@oltrahms.com';
        const password = 'OltraHMS@123';

        // NOTE: We assume these users exist from seed. If not, this script might fail if run on fresh DB without seed.
        // We will try to login.
        
        // Login Doctor
        console.log('Login as Doctor...');
        const docAuth = await axios.post(`${API_URL}/auth/login`, {
            email: doctorEmail,
            password: password
        });
        const docToken = (docAuth.data as any).token;
        const doctorId = (docAuth.data as any).user.staffId;
        console.log('✅ Doctor Logged In');

        // Login Lab Tech (or create if missing, but let's assume seed/manual creation for now or create on fly)
        // Check if Lab Tech exists in DB first just in case
        let labToken = '';
        try {
             const labAuth = await axios.post(`${API_URL}/auth/login`, {
                email: labEmail,
                password: password
            });
            labToken = (labAuth.data as any).token;
            console.log('✅ Lab Tech Logged In');
        } catch (e) {
            console.log('⚠️ Lab Tech login failed. Attempting to create one...');
            // Create user logic here if needed, but for now we expect seed update or pre-existence.
            throw new Error('Lab Tech user not found. Please run seed or create manually.');
        }

        // Get a patient
        const patients = await axios.get(`${API_URL}/doctor/patients`, {
            headers: { Authorization: `Bearer ${docToken}` }
        });
        if ((patients.data as any).length === 0) throw new Error('No patients found for doctor.');
        const patientId = (patients.data as any)[0].patientId;
        console.log(`✅ Found Patient: ${(patients.data as any)[0].patient.firstName}`);

        // 2. Doctor Orders a Lab Test
        // Need a medical record first? Or can we order directly? 
        // Logic usually requires medicalRecordId. Let's create a consultation first or find one.
        // For simplicity, let's create a NEW consultation
        const consultation = await axios.post(`${API_URL}/doctor/consultation`, {
            patientId,
            appointmentId: null, // Ad-hoc
            soap: {
                subjective: { complaint: 'Fatigue' },
                objective: { temp: 37.5 },
                assessment: { diagnosis: 'Anemia' },
                plan: { notes: 'Order CBC' }
            }
        }, { headers: { Authorization: `Bearer ${docToken}` } });
        const medicalRecordId = (consultation.data as any).recordId;
        console.log('✅ Created Consultation');

        // Order Lab
        const labOrder = await axios.post(`${API_URL}/doctor/labs`, {
            medicalRecordId,
            patientId,
            testName: 'Complete Blood Count (CBC)',
            priority: 'ROUTINE',
            clinicalIndication: 'Fatigue check'
        }, { headers: { Authorization: `Bearer ${docToken}` } });
        const orderId = (labOrder.data as any).id;
        console.log(`✅ Ordered Lab Test: ${orderId}`);

        // 3. Lab Tech Views Pending Orders
        const pendingOrders = await axios.get(`${API_URL}/labs/orders/pending`, {
            headers: { Authorization: `Bearer ${labToken}` }
        });
        const foundOrder = (pendingOrders.data as any).find((o: any) => o.id === orderId);
        if (!foundOrder) throw new Error('Lab Tech did not see the new order in pending list.');
        console.log('✅ Lab Tech sees the pending order');

        // 4. Lab Tech Starts Processing
        await axios.patch(`${API_URL}/labs/orders/${orderId}/status`, {
            status: 'IN_PROGRESS'
        }, { headers: { Authorization: `Bearer ${labToken}` } });
        console.log('✅ Lab Tech marked order as IN_PROGRESS');

        // 5. Lab Tech Uploads Results
        // Mock file upload or just data
        const resultPayload = {
            resultData: JSON.stringify({ wbc: 5.5, rbc: 4.2, hgb: 13.0 }),
            criticalFlags: JSON.stringify([]),
            aiInterpretation: 'Normal ranges.'
        };
        // Note: In real app we use FormData. Here just JSON if controller supports it, 
        // or check controller logic. Controller handles req.body fields alongside file.
        
        await axios.post(`${API_URL}/labs/orders/${orderId}/result`, resultPayload, {
            headers: { Authorization: `Bearer ${labToken}` }
        });
        console.log('✅ Lab Tech uploaded results');

        // 6. Verify Completed Status
        const finalOrders = await axios.get(`${API_URL}/labs/orders/pending`, {
            headers: { Authorization: `Bearer ${labToken}` }
        });
        const isStillPending = (finalOrders.data as any).find((o: any) => o.id === orderId);
        if (isStillPending) throw new Error('Order should not be in pending list anymore');
        console.log('✅ Order removed from pending list');

        console.log('🎉 Lab Workflow Verified Successfully!');

    } catch (error: any) {
        console.error('❌ Verification Failed:', error.response?.data || error.message);
        process.exit(1);
    }
}

main();
