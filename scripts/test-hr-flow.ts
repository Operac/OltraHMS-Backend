
import axios from 'axios';
import { prisma } from '../src/lib/prisma';

const API_URL = process.env.API_URL || 'http://localhost:3000/api';
const TEST_PASSWORD = process.env.TEST_PASSWORD;
if (!TEST_PASSWORD || TEST_PASSWORD.length < 12) {
    throw new Error('TEST_PASSWORD must be set and contain at least 12 characters');
}

async function testHRFlow() {
    console.log('🛡️ Starting HR & Payroll Flow Verification...');

    try {
        // 1. Login as Admin
        console.log('🔑 Logging in as Admin...');
        const adminLogin = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@oltrahms.com',
            password: TEST_PASSWORD
        });
        const adminToken = (adminLogin.data as any).token;
        const adminHeaders = { Authorization: `Bearer ${adminToken}` };
        console.log('✅ Admin Logged In');

        // 2. Create Test Staff
        console.log('👩‍⚕️ Creating Test Staff...');
        const staffEmail = `test.staff.${Date.now()}@oltra.com`;
        const createStaffRes = await axios.post(`${API_URL}/admin/staff`, {
            firstName: 'Test',
            lastName: 'Staff',
            email: staffEmail,
            password: TEST_PASSWORD,
            role: 'NURSE',
            departmentId: null,
            specialization: 'General'
        }, { headers: adminHeaders });
        
        const staffUser = createStaffRes.data as any;
        const staffId = staffUser.staff.id; 
        // Note: admin/staff might return User object which has Staff relation, or vice versa depending on implementation.
        // Based on verify-admin-flow, it seemed to return created user. 
        // Let's verify structure if this fails.
        console.log(`✅ Staff Created: ${staffEmail} (ID: ${staffId})`);

        // 3. Update HR Details
        console.log('💰 Updating HR Details (Salary & Leave)...');
        const baseSalary = 5000;
        const leaveBalance = 25;
        await axios.put(`${API_URL}/admin/staff/${staffId}/hr`, {
            baseSalary,
            bankDetails: {
                bankName: "Test Bank",
                accountNumber: "1234567890",
                accountName: "Test Staff"
            },
            leaveBalance
        }, { headers: adminHeaders });

        // Verify in DB
        const updatedStaff = await prisma.staff.findUnique({ where: { id: staffId } });
        if (updatedStaff?.baseSalary !== baseSalary) throw new Error('Salary update failed');
        if (updatedStaff?.leaveBalance !== leaveBalance) throw new Error('Leave balance update failed');
        console.log('✅ HR Details Updated');

        // 4. Generate Payroll
        console.log('💸 Generating Payroll...');
        const date = new Date();
        const month = date.toLocaleString('default', { month: 'long' }); // e.g., "January"
        const year = date.getFullYear();

        const payrollRes = await axios.post(`${API_URL}/payroll/generate`, {
            month,
            year
        }, { headers: adminHeaders });
        
        console.log('✅ Payroll Generation Triggered');

        // 5. Verify Payroll Record
        console.log('🔍 Verifying Payroll Record...');
        const payroll = await prisma.payroll.findFirst({
            where: {
                staffId: staffId,
                month: month,
                year: year
            }
        });

        if (!payroll) throw new Error('Payroll record not found in DB');
        if (payroll.baseSalary !== baseSalary) throw new Error(`Payroll Salary Mismatch: expected ${baseSalary}, got ${payroll.baseSalary}`);
        if (payroll.netSalary <= 0) throw new Error('Net Salary should be calculated > 0');
        console.log(`✅ Payroll Verified: Net Salary ${payroll.netSalary}`);

        // 6. Login as Staff (for Leave Request)
        console.log('🔑 Logging in as Test Staff...');
        const staffLogin = await axios.post(`${API_URL}/auth/login`, {
            email: staffEmail,
            password: TEST_PASSWORD
        });
        const staffToken = (staffLogin.data as any).token;
        const staffHeaders = { Authorization: `Bearer ${staffToken}` };
        console.log('✅ Staff Logged In');

        // 7. Request Leave
        console.log('vacation Requesting Leave...');
        const leaveDays = 5;
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(startDate.getDate() + leaveDays);

        const leaveRes = await axios.post(`${API_URL}/leaves/request`, {
            type: 'VACATION',
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            reason: 'Test Vacation'
        }, { headers: staffHeaders });
        
        const leaveId = (leaveRes.data as any).id;
        console.log(`✅ Leave Requested (ID: ${leaveId})`);

        // 8. Admin Approves Leave
        console.log('👍 Admin Approving Leave...');
        await axios.patch(`${API_URL}/leaves/${leaveId}/status`, {
            status: 'APPROVED'
        }, { headers: adminHeaders });
        console.log('✅ Leave Approved');

        // 9. Verify Leave Balance Deduction
        console.log('Ez Verifying Leave Balance Deduction...');
        const finalStaff = await prisma.staff.findUnique({ where: { id: staffId } });
        const expectedBalance = leaveBalance - leaveDays;
        
        if (finalStaff?.leaveBalance !== expectedBalance) {
            throw new Error(`Leave Balance Calculation Error. Expected ${expectedBalance}, got ${finalStaff?.leaveBalance}`);
        }
        console.log(`✅ Leave Balance Verified: ${finalStaff?.leaveBalance}`);

        // 10. Cleanup
        console.log('🧹 Cleaning Up...');
        await prisma.payroll.deleteMany({ where: { staffId } });
        await prisma.leaveRequest.deleteMany({ where: { staffId } });
        await axios.delete(`${API_URL}/admin/staff/${(staffUser as any).id}`, { headers: adminHeaders }); // Users/Staff deletion usually cascades but explicit is safe
        console.log('✅ Cleanup Complete');

        console.log('🎉 HR Flow Verified Successfully!');

    } catch (error: any) {
        console.error('❌ Verification Failed:', error.message);
        if (error.response) {
            console.error('Response Data:', JSON.stringify(error.response.data));
            console.error('Status:', error.response.status);
        }
        process.exit(1);
    }
}

testHRFlow();
