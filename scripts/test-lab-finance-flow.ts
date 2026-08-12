import axios from 'axios';

const API_URL = 'http://localhost:5000/api';
let token = '';
let patientId = '';
let labOrderId = '';
let invoiceId = '';
const TEST_PASSWORD = process.env.TEST_PASSWORD;
if (!TEST_PASSWORD || TEST_PASSWORD.length < 12) {
    throw new Error('TEST_PASSWORD must be set and contain at least 12 characters');
}

const login = async () => {
    try {
        const res = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@oltraButtons.com',
            password: TEST_PASSWORD
        });
        token = res.data.token;
        console.log('Login successful');
    } catch (error) {
        console.error('Login failed');
        process.exit(1);
    }
};

const getPatient = async () => {
    try {
        const res = await axios.get(`${API_URL}/receptionist/search?query=`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (res.data.length > 0) {
            patientId = res.data[0].id;
            console.log('Patient found:', patientId);
        } else {
            console.error('No patients found.');
            process.exit(1);
        }
    } catch (error) {
        console.error('Get Patient failed');
    }
};

const createLabOrder = async () => {
    try {
        // We need to create a medical record with lab order
        // First get a doctor ID (admin is usually linked to staff)
        const staffRes = await axios.get(`${API_URL}/receptionist/doctors`, {
             headers: { Authorization: `Bearer ${token}` }
        });
        const doctorId = staffRes.data[0]?.id;

        const res = await axios.post(`${API_URL}/medical-records`, {
            patientId,
            doctorId: doctorId,
            soap: { subjective: 'Test', objective: 'Test', assessment: 'Test', plan: 'Test' },
            labOrders: [{ test: 'Malaria', priority: 'ROUTINE' }]
        }, { headers: { Authorization: `Bearer ${token}` } });
        
        // Since medical record creation returns the record, we need to fetch the lab order ID separately 
        // or assumes it's sending back relations. 
        // The controller returns `record` which might include `labOrders` if we included them in the response?
        // Let's check `createMedicalRecord` implementation. 
        // It returns `res.status(201).json(record)`. 
        // `record` is result of `prisma.create` or `upsert`. 
        // Does it include relations? 
        // Often `create` doesn't return included relations unless `include` is specified in the create call.
        // I should fetch pending orders to find it.
        console.log('Medical Record created');
    } catch (error: any) {
         console.error('Create Lab Order failed:', error.response?.data);
    }
};

const getPendingOrder = async () => {
    try {
        const res = await axios.get(`${API_URL}/labs/orders/pending`, {
             headers: { Authorization: `Bearer ${token}` }
        });
        const order = res.data.find((o: any) => o.testName === 'Malaria' && o.patient.id === patientId && o.status === 'PENDING');
        if (order) {
            labOrderId = order.id;
            console.log('Lab Order found:', labOrderId);
            // Check invoice status
            console.log('Invoice Status:', order.medicalRecord?.invoice?.status || 'UNBILLED');
        } else {
            console.error('Lab Order not found');
        }
    } catch (error) {
        console.error('Get Pending Order failed', error);
    }
};

const createInvoice = async () => {
    try {
        const res = await axios.post(`${API_URL}/labs/orders/${labOrderId}/invoice`, {}, {
             headers: { Authorization: `Bearer ${token}` }
        });
        invoiceId = res.data.id;
        console.log('Invoice created:', invoiceId, 'Amount:', res.data.total);
    } catch (error: any) {
        console.error('Create Invoice failed:', error.response?.data);
    }
};

const payInvoice = async () => {
    try {
        await axios.post(`${API_URL}/finance/pay`, {
            invoiceId,
            amount: 1500, // Price for Malaria
            method: 'CASH'
        }, { headers: { Authorization: `Bearer ${token}` } });
        console.log('Payment successful');
    } catch (error: any) {
        console.error('Payment failed:', error.response?.data);
    }
};

const uploadResult = async () => {
    try {
        const res = await axios.post(`${API_URL}/labs/orders/${labOrderId}/result`, {
            resultData: JSON.stringify({ summary: 'Negative' })
        }, { headers: { Authorization: `Bearer ${token}` } }); // Result doesn't require file if not strictly enforced? Code says `file?.path`.
        console.log('Result uploaded:', res.data.id);
    } catch (error: any) {
        console.error('Upload Result failed:', error.response?.data);
    }
};

const run = async () => {
    await login();
    await getPatient();
    await createLabOrder();
    await getPendingOrder();
    if (labOrderId) {
        await createInvoice();
        await payInvoice();
        await uploadResult();
    }
};

run();
