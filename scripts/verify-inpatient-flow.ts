import axios from 'axios';
import { prisma } from '../src/lib/prisma';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

async function verifyInpatientFlow() {
    console.log('🏥 Starting Inpatient Flow Verification...');
    console.log(`Targeting API: ${API_URL}`);

    try {
        // 1. Setup: Admin Login
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@oltrahms.com',
            password: 'OltraHMS@123'
        });
        const token = (loginRes.data as any).token;
        const headers = { Authorization: `Bearer ${token}` };
        console.log('✅ Logged in as Admin');

        // 2. Setup: Ensure a Ward and Patient exist
        const ward = await prisma.ward.create({
            data: {
                name: `Test Ward ${Date.now()}`,
                type: 'GENERAL',
                capacity: 5,
                beds: {
                    create: [
                        { number: `T-01-${Date.now()}`, status: 'VACANT_CLEAN' },
                        { number: `T-02-${Date.now()}`, status: 'VACANT_CLEAN' }
                    ]
                }
            },
            include: { beds: true }
        });
        console.log('✅ Test Ward Created:', ward.name);

        let patient = await prisma.patient.findFirst();
        if (!patient) {
            console.log('⚠️ No patient found, creating one...');
            const user = await prisma.user.create({
                data: {
                    email: `patient.test.${Date.now()}@test.com`,
                    passwordHash: 'hash',
                    role: 'PATIENT',
                    firstName: 'Test',
                    lastName: 'Patient'
                }
            });
            patient = await prisma.patient.create({
                data: {
                    userId: user.id,
                    patientNumber: `HMS-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
                    firstName: 'Test',
                    lastName: 'Patient',
                    dateOfBirth: new Date('1990-01-01'),
                    gender: 'MALE',
                    phone: '1234567890'
                }
            });
        }
        console.log('✅ Patient Identified:', patient.patientNumber);

        // 3. Fetch Wards (API)
        console.log('📋 Fetching Wards...');
        const wardsRes = await axios.get(`${API_URL}/inpatient/wards`, { headers });
        const foundWard = (wardsRes.data as any).find((w: any) => w.id === ward.id);
        if (!foundWard) throw new Error('Created ward not found in list');
        console.log('✅ Wards List Verified');

        // 4. Admit Patient (API)
        console.log('🛌 Admitting Patient...');
        const bedId = ward.beds[0].id; // T-01
        
        const admitRes = await axios.post(`${API_URL}/inpatient/admit`, {
            patientId: patient.id,
            bedId: bedId,
            reason: 'Testing Admission'
        }, { headers });
        
        if ((admitRes.data as any).status !== 'ADMITTED') throw new Error('Admission status mismatch');
        console.log('✅ Patient Admitted to Bed');

        // 5. Verify Bed Status (DB)
        const bedAfterAdmit = await prisma.bed.findUnique({ where: { id: bedId }});
        if (bedAfterAdmit?.status !== 'OCCUPIED') throw new Error(`Bed status mismatch. Expected OCCUPIED, got ${bedAfterAdmit?.status}`);
        console.log('✅ Bed Status Verified: OCCUPIED');

        // 6. Discharge Patient (API)
        console.log('👋 Discharging Patient...');
        const admissionId = (admitRes.data as any).id;
        await axios.post(`${API_URL}/inpatient/discharge`, { admissionId }, { headers });
        console.log('✅ Patient Discharged');

        // 7. Verify Bed Dirty (DB)
        const bedAfterDischarge = await prisma.bed.findUnique({ where: { id: bedId }});
        if (bedAfterDischarge?.status !== 'VACANT_DIRTY') throw new Error(`Bed should be VACANT_DIRTY after discharge, got ${bedAfterDischarge?.status}`);
        console.log('✅ Bed Status Verified: VACANT_DIRTY');

        // 8. Clean Bed (API)
        console.log('🧹 Cleaning Bed...');
        await axios.patch(`${API_URL}/inpatient/beds/${bedId}/status`, { status: 'VACANT_CLEAN' }, { headers });
        
        const bedCleaned = await prisma.bed.findUnique({ where: { id: bedId }});
        if (bedCleaned?.status !== 'VACANT_CLEAN') throw new Error(`Bed cleaning failed. Status: ${bedCleaned?.status}`);
        console.log('✅ Bed Status Verified: VACANT_CLEAN');

        // Cleanup
        console.log('🧹 Cleaning Up Test Data...');
        try {
            await prisma.admission.deleteMany({ where: { bed: { wardId: ward.id }}});
            await prisma.bed.deleteMany({ where: { wardId: ward.id }});
            await prisma.ward.delete({ where: { id: ward.id }});
            console.log('✅ Cleanup Complete');
        } catch (cleanupError) {
            console.warn('⚠️ Cleanup warning:', cleanupError);
        }

        console.log('🎉 Inpatient Flow Verified Successfully!');

    } catch (error: any) {
        console.error('❌ Verification Failed:', error.response?.data ? JSON.stringify(error.response.data) : error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Headers:', JSON.stringify(error.response.headers));
        } else {
            console.error('Full Error:', error);
        }
        process.exit(1);
    }
}

verifyInpatientFlow();
