import axios from 'axios';
import { prisma } from '../src/lib/prisma';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const TEST_PASSWORD = process.env.TEST_PASSWORD;
if (!TEST_PASSWORD || TEST_PASSWORD.length < 12) {
    throw new Error('TEST_PASSWORD must be set and contain at least 12 characters');
}

async function verifyAdminFlow() {
    console.log('🛡️ Starting Admin Flow Verification...');

    try {
        // 1. Setup: Ensure Admin User Exists
        // Re-use admin@oltra.com
        const loginRes = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@oltrahms.com', 
            password: TEST_PASSWORD
        });
        const token = (loginRes.data as any).token;
        const headers = { Authorization: `Bearer ${token}` };
        console.log('✅ Logged in as Admin');

        // 2. Fetch Stats
        console.log('📊 Fetching System Stats...');
        const statsRes = await axios.get(`${API_URL}/admin/stats`, { headers });
        const stats = statsRes.data as any;
        if (typeof stats.totalPatients !== 'number') throw new Error('Invalid Stats Response');
        console.log('✅ Stats Verified:', stats);

        // 3. Create New Staff (Nurse)
        console.log('👩‍⚕️ Creating New Staff (Nurse)...');
        const nurseEmail = `nurse.${Date.now()}@oltra.com`;
        const createRes = await axios.post(`${API_URL}/admin/staff`, {
            firstName: 'Florence',
            lastName: 'Nightingale',
            email: nurseEmail,
            password: TEST_PASSWORD,
            role: 'NURSE',
            departmentId: null, // General
            specialization: 'Critical Care'
        }, { headers });

        const createdStaff = createRes.data as any;
        if (createdStaff.role !== 'NURSE') throw new Error('Role mismatch in response');
        console.log('✅ Staff Created:', nurseEmail);

        // 4. Verify Creation in DB
        const newUser = await prisma.user.findUnique({ 
            where: { email: nurseEmail },
            include: { staff: true }
        });
        if (!newUser || !newUser.staff) throw new Error('User or Staff record missing in DB');
        console.log('✅ DB Verification Passed');

        // 5. Update Status
        console.log('🔄 Updating Staff Status...');
        await axios.patch(`${API_URL}/admin/staff/${newUser.id}/status`, {
            status: 'INACTIVE'
        }, { headers });
        const updatedUser = await prisma.user.findUnique({ where: { id: newUser.id }});
        if (updatedUser?.status !== 'INACTIVE') throw new Error('Status update failed');
        console.log('✅ Status Update Verified');

        // 6. Check Audit Logs
        console.log('📜 Verifying Audit Logs...');
        const logsRes = await axios.get(`${API_URL}/admin/audit-logs`, { headers });
        const logs = logsRes.data as any[];
        console.log('📜 Logs Received:', logs.length);
        if (logs.length > 0) console.log('Sample Log:', JSON.stringify(logs[0]));
        const creationLog = logs.find((l: any) => l.action === 'CREATE_STAFF' && l.details.includes(nurseEmail));
        
        if (!creationLog) throw new Error('Audit Log for staff creation not found');
        console.log('✅ Audit Log Found:', creationLog.details);

        // 9. Get Staff Details
        console.log('🔍 Verifying Get Staff Details...');
        const detailsRes = await axios.get(`${API_URL}/admin/staff/${newUser.id}`, { headers });
        const details = detailsRes.data as any;
        if (details.email !== nurseEmail) throw new Error('Staff details mismatch');
        // if (!detailsRes.data.staff) throw new Error('Staff profile missing in details'); // This might fail if user structure is flat or staff is nested differently. Check Logic.
        // Controller returns user with staff included.
        if (!details.staff) throw new Error('Staff profile missing in details');
        console.log('✅ Staff Details Verified');

        // 10. Delete Staff
        console.log('🗑️ Verifying Delete Staff...');
        await axios.delete(`${API_URL}/admin/staff/${newUser.id}`, { headers });
        
        // Verify Deletion in DB
        const deletedUser = await prisma.user.findUnique({ where: { id: newUser.id } });
        if (deletedUser) throw new Error('User still exists after deletion');
        
        const deletedStaffCheck = await prisma.staff.findFirst({ where: { userId: newUser.id } });
        if (deletedStaffCheck) throw new Error('Staff profile still exists after deletion');
        console.log('✅ Staff Deletion Verified');

        console.log('🎉 Admin Flow Verified Successfully!');

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

verifyAdminFlow();
