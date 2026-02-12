
import axios from 'axios';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

async function verifyPharmacyFlow() {
    console.log('🧪 Starting Pharmacy Flow Verification...');

    try {
        // 1. Setup Data: Ensure a Medication exists
        // Clean up previous runs
        // Clean up previous runs - dependencies first!
        await prisma.inventoryBatch.deleteMany({ where: { medication: { name: 'Test-Cillin' } } });
        await prisma.dispensing.deleteMany({ where: { medication: { name: 'Test-Cillin' } } });
        await prisma.medication.deleteMany({ where: { name: 'Test-Cillin' } });
        
        const medication = await prisma.medication.create({
            data: {
                name: 'Test-Cillin',
                dosageForm: 'TABLET',
                price: 10.00,
                reorderLevel: 50,
                manufacturer: 'Test Pharma'
            }
        });

        // Ensure Admin has Staff Record (required for dispensing)
        const adminUser = await prisma.user.findUnique({ where: { email: 'admin@oltrahms.com' } });
        if (adminUser) {
             const staff = await prisma.staff.findUnique({ where: { userId: adminUser.id } });
             if (!staff) {
                 await prisma.staff.create({
                     data: {
                         userId: adminUser.id,
                         staffNumber: 'ADMIN-STF-' + Date.now(),
                         employmentStatus: 'ACTIVE',
                         hireDate: new Date()
                     }
                 });
                 console.log('   -> Created Staff Profile for Admin');
             }
        }
        console.log('✅ Created Medication:', medication.name);

        // 2. Login as Pharmacist (Assuming admin role works or we promote user)
        // Login as ADMIN for simplicity as they have access
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@oltrahms.com', 
            password: 'OltraHMS@123'
        });
        const token = (loginRes.data as any).token;
        const headers = { Authorization: `Bearer ${token}` };
        console.log('✅ Logged in as Admin/Pharmacist');

        // 3. Receive Stock (Purchase Order)
        console.log('📦 Receiving Stock...');
        const batchRes = await axios.post(`${API_URL}/inventory/receive`, {
            medicationId: medication.id,
            batchNumber: 'BATCH-001',
            expiryDate: new Date('2026-12-31'),
            quantity: 100,
            costPrice: 5.00,
            supplier: 'Global Meds'
        }, { headers });
        console.log('✅ Stock Received. Batch ID:', (batchRes.data as any).id);

        // Verify Inventory Status
        const invRes = await axios.get(`${API_URL}/inventory`, { headers });
        const medStock = (invRes.data as any).find((m: any) => m.id === medication.id);
        if (medStock.totalStock !== 100) throw new Error(`Stock mismatch: Expected 100, got ${medStock.totalStock}`);
        console.log('✅ Inventory Verification Passed');

        // 4. Create Prescription (Need to be Doctor)
        console.log('📝 Creating Prescription...');
        // Create or Find a Doctor with known password
        const doctorEmail = 'pharmacy_test_doc@oltra.com';
        let doctorUser = await prisma.user.findUnique({ where: { email: doctorEmail } });
        if (!doctorUser) {
             const hashedPassword = await bcrypt.hash('OltraHMS@123', 10);
             doctorUser = await prisma.user.create({
                 data: {
                     email: doctorEmail,
                     passwordHash: hashedPassword,
                     role: 'DOCTOR',
                     firstName: 'Pharma',
                     lastName: 'Doc',
                     staff: {
                         create: {
                             staffNumber: 'DOC-PH-' + Date.now(),
                             specialization: 'General',
                             licenseNumber: 'L-' + Date.now(),
                             hireDate: new Date()
                         }
                     }
                 }
             });
             console.log('   -> Created Doctor for Pharmacy Test');
        }

        const docLogin = await axios.post(`${API_URL}/auth/login`, { email: doctorEmail, password: 'OltraHMS@123' });
        const docHeaders = { Authorization: `Bearer ${(docLogin.data as any).token}` };
        


        
        // Use existing patient/medical record... reusing setup logic might be complex. 
        // Let's manually create a dummy record in DB for speed
        const patient = await prisma.patient.findFirst();
        if (!patient) throw new Error('No patient found');
        const doctorStaff = await prisma.staff.findFirst({ where: { userId: doctorUser.id }});

        const record = await prisma.medicalRecord.create({
            data: {
                patientId: patient.id,
                doctorId: doctorStaff!.id,
                subjective: {},
                objective: {},
                assessment: {},
                plan: {}
            }
        });

        // Use endpoint to create prescription?? Or DB? Use Endpoint to test flow.
        const prescRes = await axios.post(`${API_URL}/prescriptions`, {
            medicalRecordId: record.id,
            medicationName: 'Test-Cillin',
            dosage: '500mg',
            frequency: 'BID',
            route: 'ORAL',
            duration: 5,
            quantity: 10
        }, { headers: docHeaders });
        const prescriptionId = (prescRes.data as any).id;
        console.log('✅ Prescription Created:', prescriptionId);

        // 5. Dispense Medication
        console.log('💊 Dispensing Medication...');
        // Fetch Queue
        const queueRes = await axios.get(`${API_URL}/pharmacy/queue`, { headers });
        const queueItem = (queueRes.data as any).find((p: any) => p.id === prescriptionId);
        if (!queueItem) throw new Error('Prescription not found in queue');

        // Dispense
        const dispenseRes = await axios.post(`${API_URL}/pharmacy/dispense/${prescriptionId}`, {
            items: [{
                medicationId: medication.id,
                batchId: (batchRes.data as any).id, // Only 1 batch
                quantity: 10
            }]
        }, { headers });
        console.log('✅ Dispensed Successfully');

        // 6. Validate
        // Check Stock
        const updatedInv = await axios.get(`${API_URL}/inventory`, { headers });
        const newStock = (updatedInv.data as any).find((m: any) => m.id === medication.id);
        if (newStock.totalStock !== 90) throw new Error(`Stock mismatch after dispense: Expected 90, got ${newStock.totalStock}`);
        console.log('✅ Stock Deduction Verified');

        // Check Invoice
        const invoice = (dispenseRes.data as any).invoice;
        if (!invoice || invoice.status !== 'ISSUED') throw new Error('Invoice not generated or invalid');
        console.log('✅ Invoice Generated:', invoice.invoiceNumber);

        console.log('🎉 Pharmacy Flow Verified Successfully!');

    } catch (error: any) {
        console.error('❌ Verification Failed:', error.response?.data || error.message);
        process.exit(1);
    }
}

verifyPharmacyFlow();
