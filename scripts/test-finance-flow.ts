import axios from 'axios';

const API_URL = 'http://localhost:5000/api';
let token = '';
let patientId = ''; // Need a patient
let admissionId = '';
let invoiceId = '';

const login = async () => {
    try {
        const res = await axios.post(`${API_URL}/auth/login`, {
            email: 'admin@oltraButtons.com', // Assuming default admin
            password: 'password123'
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
            console.error('No patients found. Create one first.');
            process.exit(1);
        }
    } catch (error) {
        console.error('Get Patient failed');
    }
};

const getBed = async () => {
    try {
        const res = await axios.get(`${API_URL}/admissions/beds`, {
             headers: { Authorization: `Bearer ${token}` }
        });
        const availableBed = res.data.find((b: any) => b.status === 'AVAILABLE');
        if (availableBed) {
            return availableBed.number;
        } else {
            console.error('No beds available');
            process.exit(1);
        }
    } catch (error) {
        console.error('Get Bed failed');
    }
};

const admitPatient = async (bedNumber: string) => {
    try {
        const res = await axios.post(`${API_URL}/admissions/admit`, {
            patientId,
            bedNumber
        }, { headers: { Authorization: `Bearer ${token}` } });
        admissionId = res.data.id;
        console.log('Patient admitted:', admissionId);
    } catch (error: any) {
         console.error('Admit failed:', error.response?.data);
    }
};

const dischargePatient = async () => {
    try {
        const res = await axios.post(`${API_URL}/admissions/discharge/${admissionId}`, {}, {
             headers: { Authorization: `Bearer ${token}` }
        });
        console.log('Patient discharged. Invoice generated.');
        return res.data; // Should return invoice
    } catch (error: any) {
        console.error('Discharge failed:', error.response?.data);
    }
};

const getInvoice = async () => {
    try {
        const res = await axios.get(`${API_URL}/finance/invoices`, {
             headers: { Authorization: `Bearer ${token}` }
        });
        const inv = res.data.find((i: any) => i.patientId === patientId && i.status === 'ISSUED');
        if (inv) {
            invoiceId = inv.id;
            console.log('Invoice found:', invoiceId, 'Amount:', inv.total);
            return inv.total;
        } else {
            console.error('Invoice not found');
        }
    } catch (error) {
        console.error('Get Invoice failed');
    }
};

const payInvoice = async (amount: number) => {
     try {
        const res = await axios.post(`${API_URL}/finance/pay`, {
            invoiceId,
            amount: amount,
            method: 'CASH'
        }, { headers: { Authorization: `Bearer ${token}` } });
        console.log('Payment successful:', res.data);
    } catch (error: any) {
        console.error('Payment failed:', error.response?.data);
    }
};

const run = async () => {
    await login();
    await getPatient();
    const bedNumber = await getBed();
    if (bedNumber) {
        await admitPatient(bedNumber);
        // Simulate stay? No need for mock.
        await dischargePatient();
        const amount = await getInvoice();
        if (amount) {
            await payInvoice(amount);
        }
    }
};

run();
