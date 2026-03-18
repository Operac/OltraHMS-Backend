# OltraHMS API Documentation

Base URL: `http://localhost:3000/api`

## Authentication

All protected routes require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

### User Roles
- `ADMIN` - System administrator
- `DOCTOR` - Medical doctor
- `NURSE` - Nursing staff
- `RECEPTIONIST` - Front desk staff
- `PATIENT` - Patient account
- `PHARMACIST` - Pharmacy staff
- `LAB_TECH` - Laboratory technician
- `ACCOUNTANT` - Finance staff
- `INSURANCE_OFFICER` - Insurance claims handler

---

## Endpoints

### 1. Authentication (`/api/auth`)

#### POST /auth/register
Register a new patient account.

**Request Body:**
```json
{
  "email": "john.doe@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "gender": "MALE",
  "dateOfBirth": "1990-01-15"
}
```

**Response (201):**
```json
{
  "message": "User created successfully",
  "userId": "uuid-string"
}
```

---

#### POST /auth/login
Login to get authentication tokens.

**Request Body:**
```json
{
  "email": "admin@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "uuid-string",
    "email": "user@example.com",
    "role": "ADMIN",
    "firstName": "Admin",
    "lastName": "User",
    "staffId": "uuid-string"
  }
}
```

---

#### POST /auth/forgot-password
Request a password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response (200):**
```json
{
  "message": "Password reset email sent"
}
```

---

#### POST /auth/reset-password
Reset password using the token from email.

**Request Body:**
```json
{
  "token": "jwt-token-from-email",
  "newPassword": "newSecurePassword123"
}
```

**Response (200):**
```json
{
  "message": "Password reset successfully"
}
```

---

#### PATCH /auth/profile
Update user profile.

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.new@example.com"
}
```

**Response (200):**
```json
{
  "message": "Profile updated successfully",
  "user": {
    "id": "uuid-string",
    "email": "john.new@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "PATIENT"
  }
}
```

---

### 2. Patients (`/api/patients`)

#### POST /patients
Create a new patient (Admin, Receptionist, Doctor, Nurse).

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@example.com",
  "phone": "+1234567890",
  "dateOfBirth": "1990-01-15",
  "gender": "MALE",
  "bloodGroup": "A_POSITIVE",
  "genotype": "AA",
  "address": "123 Main Street, City",
  "emergencyContact": {
    "name": "Jane Doe",
    "phone": "+0987654321",
    "relationship": "Spouse"
  }
}
```

**Response (201):**
```json
{
  "message": "Patient registered successfully",
  "patient": {
    "id": "uuid-string",
    "patientNumber": "HMS-2026-123456",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+1234567890",
    "email": "john.doe@example.com"
  }
}
```

---

#### GET /patients
List all patients with pagination and search.

**Query Parameters:**
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 10)
- `search` (optional): Search by name, patient number, or phone
- `doctorId` (optional): Filter by doctor

**Response (200):**
```json
{
  "data": [
    {
      "id": "uuid-string",
      "patientNumber": "HMS-2026-123456",
      "firstName": "John",
      "lastName": "Doe",
      "phone": "+1234567890",
      "dateOfBirth": "1990-01-15",
      "gender": "MALE",
      "user": {
        "email": "john.doe@example.com",
        "status": "ACTIVE"
      }
    }
  ],
  "meta": {
    "total": 50,
    "page": 1,
    "limit": 10,
    "totalPages": 5
  }
}
```

---

#### GET /patients/dashboard
Get patient dashboard statistics.

**Response (200):**
```json
{
  "patientName": "John Doe",
  "nextAppointment": {
    "id": "uuid-string",
    "doctorName": "Dr. Smith",
    "specialization": "Cardiology",
    "date": "2026-03-15T10:00:00Z",
    "type": "FOLLOW_UP"
  },
  "activeMedications": 3,
  "outstandingBalance": 150.00,
  "vitals": {
    "heartRate": 72,
    "bp": "120/80",
    "temperature": 36.5,
    "weight": 70,
    "lastRecorded": "2026-03-10T09:30:00Z"
  },
  "recentActivity": [
    {
      "id": "uuid-string",
      "date": "2026-03-10T09:30:00Z",
      "diagnosis": "Annual Checkup",
      "doctorName": "Doctor"
    }
  ],
  "isProfileComplete": true
}
```

---

### 3. Appointments (`/api/appointments`)

#### POST /appointments
Create a new appointment.

**Request Body:**
```json
{
  "patientId": "uuid-string",
  "doctorId": "uuid-string",
  "startTime": "2026-03-15T10:00:00Z",
  "endTime": "2026-03-15T10:30:00Z",
  "type": "FIRST_VISIT",
  "reason": "Annual checkup"
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "patientId": "uuid-string",
  "doctorId": "uuid-string",
  "appointmentDate": "2026-03-15T10:00:00Z",
  "startTime": "2026-03-15T10:00:00Z",
  "endTime": "2026-03-15T10:30:00Z",
  "type": "FIRST_VISIT",
  "reason": "Annual checkup",
  "status": "CONFIRMED",
  "patient": {
    "firstName": "John",
    "lastName": "Doe",
    "patientNumber": "HMS-2026-123456"
  },
  "doctor": {
    "specialization": "Cardiology",
    "user": {
      "firstName": "Jane",
      "lastName": "Smith"
    }
  }
}
```

---

#### PATCH /appointments/:id/status
Update appointment status.

**Request Body:**
```json
{
  "status": "COMPLETED"
}
```

**Status Values:** `REQUESTED`, `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`, `NO_SHOW`

**Response (200):**
```json
{
  "id": "uuid-string",
  "status": "COMPLETED"
}
```

---

#### PATCH /appointments/:id/reschedule
Reschedule an appointment.

**Request Body:**
```json
{
  "startTime": "2026-03-16T14:00:00Z",
  "endTime": "2026-03-16T14:30:00Z"
}
```

**Response (200):**
```json
{
  "id": "uuid-string",
  "startTime": "2026-03-16T14:00:00Z",
  "endTime": "2026-03-16T14:30:00Z",
  "status": "CONFIRMED"
}
```

---

### 4. Medical Records (`/api/medical-records`)

#### POST /medical-records
Create a medical record (Doctor only).

**Request Body:**
```json
{
  "patientId": "uuid-string",
  "doctorId": "uuid-string",
  "appointmentId": "uuid-string",
  "soap": {
    "subjective": "Patient reports headache for 2 days",
    "objective": "BP: 120/80, Temp: 36.5°C",
    "assessment": "Tension headache",
    "plan": "Rest, pain relievers, follow up in 1 week"
  },
  "vitals": {
    "heartRate": 72,
    "bpSystolic": 120,
    "bpDiastolic": 80,
    "temperature": 36.5,
    "weight": 70
  },
  "prescriptions": [
    {
      "name": "Paracetamol",
      "dosage": "500mg",
      "frequency": "3 times daily",
      "duration": 5
    }
  ],
  "labOrders": [
    {
      "test": "Complete Blood Count",
      "priority": "ROUTINE"
    }
  ]
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "patientId": "uuid-string",
  "doctorId": "uuid-string",
  "subjective": "Patient reports headache for 2 days",
  "objective": "BP: 120/80, Temp: 36.5°C",
  "assessment": "Tension headache",
  "plan": "Rest, pain relievers, follow up in 1 week",
  "visitDate": "2026-03-12T10:00:00Z",
  "status": "COMPLETED"
}
```

---

#### GET /medical-records
Get medical records with optional filters.

**Query Parameters:**
- `patientId` (optional): Filter by patient

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "patientId": "uuid-string",
    "doctorId": "uuid-string",
    "subjective": "Patient reports headache for 2 days",
    "objective": "BP: 120/80, Temp: 36.5°C",
    "assessment": "Tension headache",
    "plan": "Rest, pain relievers",
    "visitDate": "2026-03-12T10:00:00Z",
    "doctor": {
      "user": {
        "firstName": "Jane",
        "lastName": "Smith"
      }
    }
  }
]
```

---

### 5. Doctors (`/api/doctor`)

#### GET /doctor/dashboard/stats
Get doctor dashboard statistics.

**Response (200):**
```json
{
  "stats": {
    "totalToday": 10,
    "waiting": 3,
    "inProgress": 2,
    "completed": 5,
    "nextPatient": {
      "id": "uuid-string",
      "patient": {
        "firstName": "John",
        "lastName": "Doe",
        "patientNumber": "HMS-2026-123456"
      },
      "startTime": "2026-03-12T11:00:00Z"
    }
  },
  "appointments": [
    {
      "id": "uuid-string",
      "startTime": "2026-03-12T09:00:00Z",
      "endTime": "2026-03-12T09:30:00Z",
      "status": "COMPLETED",
      "patient": {
        "firstName": "Jane",
        "lastName": "Doe",
        "patientNumber": "HMS-2026-123457"
      }
    }
  ]
}
```

---

#### GET /doctor/patients/:patientId/history
Get patient medical history.

**Response (200):**
```json
{
  "id": "uuid-string",
  "firstName": "John",
  "lastName": "Doe",
  "medicalRecords": [
    {
      "id": "uuid-string",
      "visitDate": "2026-03-10T10:00:00Z",
      "subjective": "Annual checkup",
      "assessment": "Healthy",
      "doctor": {
        "user": {
          "firstName": "Jane",
          "lastName": "Smith"
        }
      },
      "prescriptions": [
        {
          "id": "uuid-string",
          "medicationName": "Vitamin C",
          "dosage": "500mg",
          "frequency": "Once daily"
        }
      ],
      "labOrders": [
        {
          "id": "uuid-string",
          "testName": "Blood Sugar",
          "status": "COMPLETED"
        }
      ]
    }
  ]
}
```

---

#### POST /doctor/consultation
Save consultation notes.

**Request Body:**
```json
{
  "appointmentId": "uuid-string",
  "patientId": "uuid-string",
  "notes": "Patient shows improvement...",
  "diagnosis": "Common cold",
  "treatmentPlan": "Continue medication"
}
```

**Response (201):**
```json
{
  "message": "Consultation saved successfully"
}
```

---

### 6. Prescriptions (`/api/prescriptions`)

#### POST /prescriptions
Create a prescription (Doctor only).

**Request Body:**
```json
{
  "medicalRecordId": "uuid-string",
  "medicationName": "Amoxicillin",
  "dosage": "500mg",
  "frequency": "3 times daily",
  "route": "ORAL",
  "duration": 7,
  "quantity": 21
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "medicalRecordId": "uuid-string",
  "patientId": "uuid-string",
  "medicationName": "Amoxicillin",
  "dosage": "500mg",
  "frequency": "3 times daily",
  "route": "ORAL",
  "duration": 7,
  "quantity": 21,
  "status": "PENDING"
}
```

---

#### GET /prescriptions
List prescriptions.

**Query Parameters:**
- `patientId` (optional): Filter by patient

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "medicationName": "Amoxicillin",
    "dosage": "500mg",
    "frequency": "3 times daily",
    "status": "PENDING",
    "createdAt": "2026-03-12T10:00:00Z",
    "medicalRecord": {
      "doctor": {
        "user": {
          "firstName": "Jane",
          "lastName": "Smith"
        }
      }
    }
  }
]
```

---

#### POST /prescriptions/:id/refill
Request a prescription refill.

**Response (200):**
```json
{
  "id": "uuid-string",
  "status": "REFILL_REQUESTED"
}
```

---

### 7. Billing (`/api/billing`)

#### POST /billing/pay
Process a payment.

**Request Body:**
```json
{
  "invoiceId": "uuid-string",
  "amount": 150.00,
  "method": "CASH"
}
```

**Payment Methods:** `CASH`, `CARD`, `BANK_TRANSFER`, `INSURANCE`

**Response (200):**
```json
{
  "message": "Payment successful",
  "payment": {
    "id": "uuid-string",
    "invoiceId": "uuid-string",
    "amount": 150.00,
    "method": "CASH",
    "status": "COMPLETED",
    "transactionReference": "TX-1234567890"
  }
}
```

---

#### GET /billing/patient/me
Get patient's invoices.

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "invoiceNumber": "INV-2026-001",
    "total": 150.00,
    "amountPaid": 50.00,
    "balance": 100.00,
    "status": "PARTIAL",
    "createdAt": "2026-03-10T10:00:00Z"
  }
]
```

---

### 8. Pharmacy (`/api/pharmacy`)

#### GET /pharmacy/queue
Get pending prescriptions queue.

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "medicationName": "Amoxicillin",
    "dosage": "500mg",
    "frequency": "3 times daily",
    "status": "PENDING",
    "patient": {
      "firstName": "John",
      "lastName": "Doe",
      "patientNumber": "HMS-2026-123456"
    },
    "medicalRecord": {
      "doctor": {
        "user": {
          "lastName": "Smith"
        }
      },
      "invoice": {
        "status": "PAID",
        "invoiceNumber": "INV-2026-001"
      }
    }
  }
]
```

---

#### POST /pharmacy/dispense/:prescriptionId
Dispense medication.

**Request Body:**
```json
{
  "items": [
    {
      "medicationId": "uuid-string",
      "batchId": "uuid-string",
      "quantity": 21
    }
  ]
}
```

**Response (200):**
```json
{
  "message": "Medication dispensed successfully",
  "dispensing": {
    "id": "uuid-string",
    "prescriptionId": "uuid-string",
    "quantity": 21,
    "dispensedAt": "2026-03-12T11:00:00Z"
  }
}
```

---

### 9. Laboratory (`/api/labs`)

#### GET /labs/orders/pending
Get pending lab orders.

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "testName": "Complete Blood Count",
    "priority": "ROUTINE",
    "status": "PENDING",
    "patient": {
      "firstName": "John",
      "lastName": "Doe"
    },
    "createdAt": "2026-03-12T10:00:00Z"
  }
]
```

---

#### POST /labs/orders/:id/result
Upload lab result.

**Request:** `multipart/form-data`
- `file`: File upload (jpg, png, pdf)
- `data`: JSON string with result details

```json
{
  "resultData": "Normal findings",
  "findings": "All values within normal range"
}
```

**Response (201):**
```json
{
  "message": "Result uploaded successfully"
}
```

---

### 10. Admin (`/api/admin`)

#### GET /admin/stats
Get system statistics.

**Response (200):**
```json
{
  "totalPatients": 150,
  "activeStaff": 25,
  "todayAppointments": 45,
  "revenuePending": 15000.00
}
```

---

#### POST /admin/staff
Create a new staff member.

**Request Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "email": "jane.smith@example.com",
  "password": "password123",
  "role": "DOCTOR",
  "departmentId": "uuid-string",
  "specialization": "Cardiology"
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "email": "jane.smith@example.com",
  "role": "DOCTOR",
  "firstName": "Jane",
  "lastName": "Smith"
}
```

---

#### GET /admin/staff
List all staff members.

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane.smith@example.com",
    "role": "DOCTOR",
    "status": "ACTIVE",
    "staff": {
      "id": "uuid-string",
      "staffNumber": "STF-2026-123456",
      "specialization": "Cardiology",
      "department": {
        "name": "Cardiology"
      }
    }
  }
]
```

---

#### PATCH /admin/staff/:userId/status
Update staff status.

**Request Body:**
```json
{
  "status": "INACTIVE"
}
```

**Response (200):**
```json
{
  "message": "Staff status updated"
}
```

---

#### GET /admin/audit-logs
Get system audit logs.

**Query Parameters:**
- `action` (optional): Filter by action type

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "action": "USER_LOGIN",
    "entityType": "User",
    "entityId": "uuid-string",
    "details": "Login successful",
    "timestamp": "2026-03-12T10:00:00Z",
    "user": {
      "firstName": "Admin",
      "lastName": "User",
      "role": "ADMIN"
    }
  }
]
```

---

### 11. Departments (`/api/departments`)

#### POST /departments
Create a department (Admin only).

**Request Body:**
```json
{
  "name": "Cardiology",
  "description": "Heart and cardiovascular system",
  "location": "Building A, Floor 2"
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "name": "Cardiology",
  "description": "Heart and cardiovascular system",
  "location": "Building A, Floor 2"
}
```

---

#### GET /departments
List all departments.

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "name": "Cardiology",
    "description": "Heart and cardiovascular system",
    "location": "Building A, Floor 2"
  },
  {
    "id": "uuid-string",
    "name": "Pediatrics",
    "description": "Children's health",
    "location": "Building B, Floor 1"
  }
]
```

---

### 12. Finance (`/api/finance`)

#### GET /finance/invoices
Get pending invoices.

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "invoiceNumber": "INV-2026-001",
    "total": 500.00,
    "balance": 500.00,
    "status": "ISSUED",
    "patient": {
      "firstName": "John",
      "lastName": "Doe"
    }
  }
]
```

---

#### POST /finance/services
Create a new service/price item.

**Request Body:**
```json
{
  "name": "General Consultation",
  "description": "Standard doctor consultation",
  "price": 50.00,
  "category": "CONSULTATION"
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "name": "General Consultation",
  "description": "Standard doctor consultation",
  "price": 50.00,
  "category": "CONSULTATION"
}
```

---

#### POST /finance/expenses
Add an expense.

**Request Body:**
```json
{
  "description": "Medical supplies",
  "amount": 200.00,
  "category": "SUPPLIES",
  "date": "2026-03-10"
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "description": "Medical supplies",
  "amount": 200.00,
  "category": "SUPPLIES",
  "date": "2026-03-10T00:00:00Z"
}
```

---

### 13. Payroll (`/api/payroll`)

#### POST /payroll/generate
Generate payroll for a period.

**Request Body:**
```json
{
  "month": 3,
  "year": 2026
}
```

**Response (201):**
```json
{
  "message": "Payroll generated successfully"
}
```

---

#### GET /payroll/my
Get my payslips.

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "month": 2,
    "year": 2026,
    "baseSalary": 5000.00,
    "deductions": 500.00,
    "netSalary": 4500.00,
    "status": "PAID",
    "paidAt": "2026-03-05T10:00:00Z"
  }
]
```

---

### 14. Leave Management (`/api/leaves`)

#### POST /leaves/request
Request leave.

**Request Body:**
```json
{
  "leaveTypeId": "uuid-string",
  "startDate": "2026-04-01",
  "endDate": "2026-04-05",
  "reason": "Family vacation"
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "status": "PENDING",
  "startDate": "2026-04-01T00:00:00Z",
  "endDate": "2026-04-05T00:00:00Z"
}
```

---

#### GET /leaves/my
Get my leave requests.

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "leaveType": {
      "name": "Annual Leave"
    },
    "startDate": "2026-04-01T00:00:00Z",
    "endDate": "2026-04-05T00:00:00Z",
    "status": "PENDING",
    "reason": "Family vacation"
  }
]
```

---

### 15. Admissions (`/api/admissions`)

#### POST /admissions/admit
Admit a patient.

**Request Body:**
```json
{
  "patientId": "uuid-string",
  "wardId": "uuid-string",
  "bedId": "uuid-string",
  "admissionType": "ELECTIVE",
  "reason": "Surgery follow-up"
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "patientId": "uuid-string",
  "wardId": "uuid-string",
  "bedId": "uuid-string",
  "status": "ADMITTED",
  "admittedAt": "2026-03-12T10:00:00Z"
}
```

---

#### POST /admissions/discharge/:id
Discharge a patient.

**Request Body:**
```json
{
  "dischargeSummary": "Patient recovered well...",
  "dischargeInstructions": "Rest for 2 weeks"
}
```

**Response (200):**
```json
{
  "id": "uuid-string",
  "status": "DISCHARGED",
  "dischargedAt": "2026-03-15T14:00:00Z"
}
```

---

#### GET /admissions/beds
Get all beds with status.

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "bedNumber": "101-A",
    "status": "OCCUPIED",
    "ward": {
      "name": "General Ward"
    },
    "currentPatient": {
      "firstName": "John",
      "lastName": "Doe"
    }
  }
]
```

---

### 16. Inpatient Care (`/api/inpatient`)

#### POST /inpatient/medications/log
Log medication administration.

**Request Body:**
```json
{
  "prescriptionId": "uuid-string",
  "patientId": "uuid-string",
  "administeredAt": "2026-03-12T10:00:00Z",
  "notes": "Patient took medication without issues"
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "prescriptionId": "uuid-string",
  "administeredAt": "2026-03-12T10:00:00Z"
}
```

---

#### POST /inpatient/fluids
Log fluid balance.

**Request Body:**
```json
{
  "patientId": "uuid-string",
  "intake": 1500,
  "output": 800,
  "notes": "Patient drank 1.5L water"
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "patientId": "uuid-string",
  "intake": 1500,
  "output": 800,
  "balance": 700
}
```

---

### 17. Vital Signs (`/api/vitals`)

#### POST /vitals
Record vital signs.

**Request Body:**
```json
{
  "patientId": "uuid-string",
  "heartRate": 72,
  "bpSystolic": 120,
  "bpDiastolic": 80,
  "temperature": 36.5,
  "weight": 70,
  "respiratoryRate": 16,
  "oxygenSaturation": 98
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "patientId": "uuid-string",
  "heartRate": 72,
  "bpSystolic": 120,
  "bpDiastolic": 80,
  "temperature": 36.5,
  "recordedAt": "2026-03-12T10:00:00Z"
}
```

---

### 18. Surgery (`/api/surgery`)

#### POST /surgery/cases
Schedule surgery.

**Request Body:**
```json
{
  "patientId": "uuid-string",
  "theaterId": "uuid-string",
  "surgeonId": "uuid-string",
  "scheduledStart": "2026-03-20T08:00:00Z",
  "scheduledEnd": "2026-03-20T10:00:00Z",
  "procedure": "Appendectomy",
  "anesthesiaType": "GENERAL",
  "notes": "Standard procedure"
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "patientId": "uuid-string",
  "theaterId": "uuid-string",
  "status": "SCHEDULED",
  "procedure": "Appendectomy"
}
```

---

### 19. Radiology (`/api/radiology`)

#### POST /radiology/requests
Create imaging request.

**Request Body:**
```json
{
  "patientId": "uuid-string",
  "testId": "uuid-string",
  "clinicalNotes": "Chest pain investigation",
  "priority": "URGENT"
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "patientId": "uuid-string",
  "testName": "Chest X-Ray",
  "status": "PENDING",
  "priority": "URGENT"
}
```

---

### 20. Wellness (`/api/wellness`)

#### POST /wellness
Create wellness goal.

**Request Body:**
```json
{
  "title": "Exercise Daily",
  "target": 10000,
  "unit": "steps",
  "startDate": "2026-03-01",
  "endDate": "2026-04-01"
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "title": "Exercise Daily",
  "target": 10000,
  "current": 0,
  "status": "ACTIVE"
}
```

---

#### PATCH /wellness/:id/checkin
Check in to wellness goal.

**Request Body:**
```json
{
  "value": 5000
}
```

**Response (200):**
```json
{
  "id": "uuid-string",
  "current": 5000,
  "status": "IN_PROGRESS"
}
```

---

### 21. Notifications (`/api/notifications`)

#### GET /notifications
Get user notifications.

**Response (200):**
```json
[
  {
    "id": "uuid-string",
    "title": "Appointment Reminder",
    "message": "Your appointment is tomorrow at 10:00 AM",
    "type": "APPOINTMENT",
    "isRead": false,
    "createdAt": "2026-03-12T08:00:00Z"
  }
]
```

---

#### PATCH /notifications/:id/read
Mark notification as read.

**Response (200):**
```json
{
  "message": "Notification marked as read"
}
```

---

### 22. Video/Telemedicine (`/api/video`)

#### POST /video/sessions
Create video session.

**Request Body:**
```json
{
  "appointmentId": "uuid-string"
}
```

**Response (201):**
```json
{
  "id": "uuid-string",
  "appointmentId": "uuid-string",
  "status": "ACTIVE",
  "sessionId": "session-uuid",
  "token": "webrtc-token"
}
```

---

## Error Responses

All API endpoints may return the following error responses:

| Status Code | Description | Example |
|-------------|-------------|---------|
| 400 | Bad Request - Invalid input | `{"message": "Email and password are required"}` |
| 401 | Unauthorized - Invalid or missing token | `{"message": "Unauthorized"}` |
| 403 | Forbidden - Insufficient permissions | `{"message": "Access denied"}` |
| 404 | Not Found - Resource not found | `{"message": "Patient not found"}` |
| 409 | Conflict - Resource conflict | `{"message": "Doctor is not available at this time"}` |
| 500 | Internal Server Error | `{"message": "Failed to fetch patients"}` |

---

## Enums

### Appointment Status
- `REQUESTED` - Appointment requested by patient
- `CONFIRMED` - Appointment confirmed
- `CHECKED_IN` - Patient checked in
- `IN_PROGRESS` - Consultation in progress
- `COMPLETED` - Appointment completed
- `CANCELLED` - Appointment cancelled
- `NO_SHOW` - Patient did not show

### Invoice Status
- `ISSUED` - Invoice issued
- `PARTIAL` - Partially paid
- `PAID` - Fully paid
- `OVERDUE` - Payment overdue

### Prescription Status
- `PENDING` - Pending dispensing
- `DISPENSED` - Medication dispensed
- `CANCELLED` - Prescription cancelled
- `REFILL_REQUESTED` - Refill requested

### Gender
- `MALE`
- `FEMALE`
- `OTHER`

### Payment Method
- `CASH`
- `CARD`
- `BANK_TRANSFER`
- `INSURANCE`


### Video Session Status
- `ACTIVE` - Active session
- `COMPLETED` - Completed session
- `CANCELLED` - Cancelled session - `NO_SHOW` - Patient did not show  
- `FAILED` - Session failed 