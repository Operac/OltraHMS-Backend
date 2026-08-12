import axios from 'axios';

const API_URL = 'http://localhost:3000/api';
let token = '';
const TEST_PASSWORD = process.env.TEST_PASSWORD;
if (!TEST_PASSWORD || TEST_PASSWORD.length < 12) {
    throw new Error('TEST_PASSWORD must be set and contain at least 12 characters');
}

const login = async () => {
    try {
        const res = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@oltrahms.com', 
            password: TEST_PASSWORD
        });
        token = (res.data as any).token;
        console.log('Login successful. Token acquired.');
    } catch (error: any) {
        console.error('Login failed Details:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error('Message:', error.message);
        }
        process.exit(1);
    }
};

const testServices = async () => {
    console.log('\n--- Testing Services ---');
    try {
        // 1. Create Service
        const newService = {
            name: 'Test Lab Service ' + Date.now(),
            type: 'LAB',
            price: 150.00,
            code: 'LAB-' + Date.now(),
            isExternal: false,
            description: 'A test lab service'
        };
        const createRes = await axios.post(`${API_URL}/finance/services`, newService, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Create Service:', createRes.status === 201 ? 'PASSED' : 'FAILED');
        const serviceId = (createRes.data as any).id;

        // 2. Get Services
        const getRes = await axios.get(`${API_URL}/finance/services`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Get Services:', getRes.status === 200 && (getRes.data as any[]).length > 0 ? 'PASSED' : 'FAILED');

        // 3. Update Service
        const updateRes = await axios.patch(`${API_URL}/finance/services/${serviceId}`, {
            price: 175.00
        }, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Update Service:', updateRes.status === 200 && (updateRes.data as any).price === 175 ? 'PASSED' : 'FAILED');

        // 4. Delete Service (Cleanup)
        const deleteRes = await axios.delete(`${API_URL}/finance/services/${serviceId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Delete Service:', deleteRes.status === 200 ? 'PASSED' : 'FAILED');

    } catch (error: any) {
        console.error('Service test failed:', error.response?.data || error.message);
    }
};

const testExpenses = async () => {
    console.log('\n--- Testing Expenses ---');
    try {
        // 1. Create Expense
        const newExpense = {
            description: 'Test Expense ' + Date.now(),
            amount: 500.00,
            category: 'SUPPLIES',
            incurredAt: new Date().toISOString()
        };
        const createRes = await axios.post(`${API_URL}/finance/expenses`, newExpense, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Create Expense:', createRes.status === 201 ? 'PASSED' : 'FAILED');

        // 2. Get Expenses
        const getRes = await axios.get(`${API_URL}/finance/expenses`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Get Expenses:', getRes.status === 200 && (getRes.data as any[]).length > 0 ? 'PASSED' : 'FAILED');

        // 3. Get Profit/Loss
        const reportRes = await axios.get(`${API_URL}/finance/reports/profit-loss`, {
            headers: { Authorization: `Bearer ${token}` },
            params: {
                startDate: new Date(Date.now() - 86400000).toISOString(), // Yesterday
                endDate: new Date().toISOString()
            }
        });
        console.log('Get Profit/Loss:', reportRes.status === 200 ? 'PASSED' : 'FAILED');
        console.log('Report Data:', reportRes.data);

    } catch (error: any) {
        console.error('Expense test failed:', error.response?.data || error.message);
    }
};

const runTests = async () => {
    await login();
    await testServices();
    await testExpenses();
};

runTests();
