# OltraHMS

OltraHMS is a comprehensive Hospital Management System designed to streamline healthcare operations. It facilitates interaction between Administrators, Doctors, Patients, Pharmacists, Lab Technicians, and Receptionists through a unified, role-based platform.

## Table of Contents

- [Features](#features)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [Default Login Credentials](#default-login-credentials)
- [Environment Variables](#environment-variables)
- [Running Tests](#running-tests)
- [Available Scripts](#available-scripts)
- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [Deployment](#deployment)
- [Changelog](docs/CHANGELOG.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Database Documentation](docs/DATABASE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Features

- **Role-Based Access Control**: Secure authentication and authorization for various staff roles and patients.
- **Two-Factor Authentication (2FA)**: TOTP-based 2FA with AES-256-CBC encrypted secrets.
- **Patient Portal**: Appointment booking, medical history access, prescription viewing, and telemedicine.
- **Doctor Dashboard**: Patient consultation, diagnosis recording (SOAP format), prescription issuance, and appointment management.
- **Pharmacy Management**: Inventory tracking with FEFO (First-Expired-First-Out) batch selection, stock alerts, prescription availability checking, and medication dispensing with payment verification.
- **Laboratory Management**: Test request handling, result entry with payment verification, and reporting.
- **Radiology**: Imaging requests and report management by radiology staff.
- **Surgery Scheduling**: Operating theater booking and case management.
- **Inpatient Care**: Ward management, bed allocation, medication administration records (MAR), fluid balance tracking, and ward round notes.
- **Billing & Invoicing**: Automated invoice generation with unique invoice numbers (timestamp + random hex), payment verification, and refund processing.
- **Payroll Management**: Staff salary processing with configurable currency (NGN/USD) and payslip generation.
- **Leave Management**: Leave request and approval workflow with leave balance tracking.
- **Telemedicine**: Secure video consultations using WebRTC with session initialization.
- **Real-time Chat**: Staff communication via Socket.io.
- **Notifications**: Real-time notification system for appointments, prescriptions, lab results, and low stock alerts.
- **Audit Logs**: System activity tracking for compliance with detailed entity changes.
- **Wellness Tracking**: Patient wellness goal tracking with check-ins, vitals recording, medication logging, mood tracking, sleep tracking, symptom tracking, and reminders.
- **Insurance Management**: Patient insurance policy management with coverage tracking.
- **Appointment Reminders**: Automated email reminders for upcoming appointments.
- **Prescription Refills**: Track and manage prescription refill requests with remaining refills.
- **PDF Prescriptions**: Generate downloadable PDF prescriptions.
- **Payment Processing**: Secure payment processing with invoice verification before service delivery.
- **Multi-Currency Support**: Nigerian Naira (₦) support across all financial models.
- **Refund Processing**: Full refund workflow with refund method selection.

---

## Recent Fixes (April 2026)

### TypeError Fixes

- Fixed "A.result?.toLowerCase is not a function" errors in frontend filtering operations
- Added String() conversions before toLowerCase() calls to handle null/undefined values
- Affected files:
  - `frontend/src/pages/doctor/MedicalRecords.tsx`
  - `frontend/src/pages/finance/ServiceManagement.tsx`
  - `frontend/src/pages/patient/Records.tsx`
  - `frontend/src/pages/finance/InsuranceClaims.tsx`

## Technology Stack

| Layer | Technology |

|-------|------------|

| **Frontend** | React, TypeScript, Vite, Tailwind CSS, Axios, React Hook Form, Zod |
| **Backend** | Node.js, Express, TypeScript, Prisma ORM, PostgreSQL |
| **Real-time** | Socket.io (Chat, Notifications, Video Signaling) |
| **Testing** | Playwright (End-to-End) |
| **File Storage** | Cloudinary |
| **Authentication** | JWT (Access + Refresh Tokens) |

---

## Security Features

- **Two-Factor Authentication (2FA)**: TOTP-based 2FA with AES-256-CBC encrypted secrets
- **Password Security**: Bcrypt password hashing with salt rounds + cryptographically secure random password generation
- **Rate Limiting**: Protection against brute force attacks on authentication endpoints
- **Input Sanitization**: XSS prevention via HTML escaping
- **CORS Protection**: Configurable CORS with production-safe defaults
- **JWT Authentication**: Secure token-based authentication with access and refresh tokens
- **Role-Based Access Control**: Granular permissions per user role
- **Soft Delete**: Data retention with `isDeleted` flag
- **Audit Logging**: Track all system activities with detailed entity changes
- **Production-Safe Errors**: Error messages don't leak sensitive information
- **Payment Verification**: Invoice validation required before pharmacy dispensing and lab results
- **Secure 2FA Storage**: TOTP secrets encrypted before storage in database

---

## Project Structure

OltraHMS/
├── backend/                 # Backend API server
│   ├── src/
│   │   ├── controllers/    # Request handlers
│   │   ├── routes/         # API route definitions
│   │   ├── middleware/     # Auth, validation middleware
│   │   ├── services/       # Business logic services
│   │   ├── lib/            # Prisma client, utilities
│   │   ├── socket/         # Socket.io handlers
│   │   └── server.ts       # Express server entry
│   ├── prisma/
│   │   ├── schema.prisma   # Database schema
│   │   ├── seed.ts         # Database seeder
│   │   └── migrations/     # Database migrations
│   └── scripts/            # Utility scripts
│
├── frontend/               # React frontend application
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Page components by role
│   │   ├── context/       # React context providers
│   │   ├── hooks/         # Custom React hooks
│   │   ├── layouts/       # Layout components
│   │   └── lib/          # API client, utilities
│   └── tests/            # Playwright tests
│
├── design-system/         # Design system documentation
├── docs/                  # API documentation
│   └── API.md            # API reference
│
└── package.json           # Root workspace config

---

## Quick Start

```bash
# 1. Clone the repository
git clone <repository-url>
cd OltraHMS

# 2. Setup Backend
cd backend
npm install
# Configure .env file (see Environment Variables)
npx prisma generate
npx prisma db push
npm run dev

# 3. Setup Frontend (in new terminal)
cd frontend
npm install
# Configure .env file
npm run dev
```

---

## Prerequisites

- Node.js (v18.0.0 or higher)
- PostgreSQL (v14 or higher)
- npm (v9 or higher)

---

## Setup Instructions

### 1. Database Configuration

Ensure your PostgreSQL instance is running. You will need a connection string for the `DATABASE_URL`.

### 2. Backend Setup

Navigate to the backend directory and install dependencies:

```bash
cd backend
npm install
```

Configure environment variables:
Create a `.env` file in the `backend` directory (see Environment Variables section below).

Initialize the database:

```bash
npx prisma generate
npx prisma db push
npx prisma db seed  # Populates default admin, doctor, and patient data
```

Start the development server:

```bash
npm run dev

The server will start on `http://localhost:3000` (or your specified PORT).

### 3. Frontend Setup

Navigate to the frontend directory and install dependencies:

```bash
cd frontend
npm install
```

Configure environment variables:
Create a `.env` file in the `frontend` directory.

Start the development server:

```bash
npm run dev

The application will be available at `http://localhost:5173`.

---

## Default Login Credentials

After running `npx prisma db seed`, the following account types are available:

| Role | Description |
|------|-------------|
| **Admin** | System administrator with full access |
| **Doctor** | Medical doctors with patient access |
| **Nurse** | Nursing staff with patient care access |
| **Radiologist** | Radiology staff for imaging requests and reports |
| **Receptionist** | Front desk staff for patient management |
| **Pharmacist** | Pharmacy staff for medication dispensing |
| **Lab Technician** | Lab staff for test processing |
| **Accountant** | Finance staff for billing |
| **Patient** | Patient portal access |

> **Note**: Default credentials are set in the seed file. Check `backend/prisma/seed.ts` for current credentials.

---

## Environment Variables

### Backend (.env)

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | API Port (default: 3000) | No |
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | Secret key for access tokens | Yes |
| `REFRESH_SECRET` | Secret key for refresh tokens | Yes |
| `FRONTEND_URL` | CORS Allowed Origin (e.g., http://localhost:5173) | Yes |
| `EMAIL_USER` | SMTP Username/Email | No |
| `EMAIL_PASS` | SMTP Password | No |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | No |
| `CLOUDINARY_API_KEY` | Cloudinary API key | No |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | No |
| `TWO_FACTOR_KEY` | 32-char hex key for 2FA encryption | No |
| `JITSI_URL` | Jitsi Meet server URL | No |
| `JITSI_APP_ID` | Jitsi app ID for JWT tokens | No |
| `JITSI_SECRET` | Jitsi secret for JWT tokens | No |
| `SKIP_INVOICE_CHECK` | Skip invoice validation in pharmacy | No |

**Example `.env` file:**
```env
PORT=3000
DATABASE_URL="postgresql://user:password@localhost:5432/oltrahms"
JWT_SECRET=your-super-secret-jwt-key
REFRESH_SECRET=your-super-secret-refresh-key
FRONTEND_URL=http://localhost:5173
```

### Frontend (.env)

| Variable         | Description                                          | Required |
|------------------|------------------------------------------------------|----------|
| `VITE_API_URL`   | Backend API URL (e.g., `http://localhost:3000/api`)  | Yes      |
| `VITE_SOCKET_URL`| Socket.io connection URL                             | Yes      |

**Example `.env` file:**

```env

VITE_API_URL=http://localhost:3000/api
VITE_SOCKET_URL=http://localhost:3000


---

## Running Tests

To execute the End-to-End test suite using Playwright:

```bash
cd frontend
npx playwright test
```

To run tests with UI:

```bash
npx playwright test --ui
```

---

## Available Scripts

### Backend Scripts

```bash
cd backend

npm run dev          # Start development server with nodemon
npm run build        # Compile TypeScript to JavaScript
npm start            # Run production server
npx prisma studio    # Open Prisma database GUI
npx prisma db push   # Push schema changes to database
npx prisma db seed   # Seed database with sample data
```

### Frontend Scripts

```bash
cd frontend

npm run dev          # Start Vite development server
npm run build        # Build for production
npm run lint         # Run ESLint
npx playwright test  # Run E2E tests
```

### Utility Scripts

Located in `backend/scripts/`:

- `verify-admin-flow.ts` - Test admin workflow
- `verify-doctor-flow.ts` - Test doctor workflow
- `verify-receptionist-flow.ts` - Test receptionist workflow
- `verify-lab-flow.ts` - Test laboratory workflow
- `verify-pharmacy-flow.ts` - Test pharmacy workflow
- `verify-inpatient-flow.ts` - Test inpatient workflow

Run a script:

```bash

cd backend
npx tsx scripts/verify-admin-flow.ts
```

---

## API Documentation

Full API documentation is available in [`docs/API.md`](docs/API.md).

The API includes:

- **100+ endpoints** across 33 categories
- **JWT Authentication** with access and refresh tokens
- **Role-based authorization** for all endpoints
- **Real-time features** via Socket.io

### Queue & Display Management

#### Queue Management

- `GET /api/queue` - Get all queues
- `GET /api/queue/doctor/:id` - Get doctor's queue
- `POST /api/queue/checkin` - Check in patient with insurance validation
- `POST /api/queue/call-next` - Call next patient (requires triage)
- `GET /api/queue/insurance/validate/:patientId` - Validate patient insurance

#### Display (for TV/LCD screens)

- `GET /api/display` - All queue display
- `GET /api/display/doctor/:id` - Single doctor display

#### Insurance (HMO)

- `PATCH /api/patient/insurance/:insuranceId/verify` - Manual verification (admin)

### HMO Verification Workflow

1. Patient adds insurance in profile
2. Status: PENDING (default)
3. Reception clicks "Verify" after phone confirmation
4. Status: VERIFIED / REJECTED
5. At check-in: system checks expiry + status
6. Warnings shown but check-in always allowed

### Key API Modules

| Module | Description |

|--------|------------- |
| `/api/auth` | Authentication (login, register, 2FA, password reset, profile) |
| `/api/patients` | Patient management, profiles, medication schedules |
| `/api/appointments` | Appointment scheduling, rescheduling |
| `/api/medical-records` | Clinical records (SOAP format), PDF downloads |
| `/api/prescriptions` | Prescription management, refills, PDF generation |
| `/api/pharmacy` | Pharmacy queue, FEFO dispensing, inventory checks |
| `/api/labs` | Laboratory orders, results, payment verification |
| `/api/radiology` | Imaging requests and reports |
| `/api/surgery` | Surgery scheduling, theater management |
| `/api/inpatient` | MAR, fluid balance, ward rounds |
| `/api/admissions` | Bed management, admissions, deposits |
| `/api/billing` | Invoice and payment processing |
| `/api/finance` | Financial reports, expenses, refunds |
| `/api/payroll` | Staff payroll management |
| `/api/leaves` | Leave requests, balances |
| `/api/admin` | Staff CRUD, audit logs |
| `/api/vitals` | Vital signs recording |
| `/api/wellness` | Goals, vitals, medications, moods, sleep, symptoms |
| `/api/video` | Telemedicine sessions |
| `/api/chat` | Real-time messaging |
| `/api/notifications` | Notification management |
| `/api/departments` | Department management |
| `/api/ward` | Ward and bed management |
| `/api/services` | Hospital services pricing |
| `/api/inventory` | Medication inventory, alerts |
| `/api/receptionist` | Check-in, search, registration |
| `/api/dashboard` | Dashboard statistics |
| `/api/reports` | Financial and patient stats |
| `/api/public` | Waitlist signup |

---

## Database Schema

The database schema is defined in [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma).

### Key Models

- **User** - System users (staff and patients) with 2FA support
- **Patient** - Patient profiles with insurance and dependents
- **Staff** - Employee profiles linked to users with currency settings
- **Department** - Hospital departments
- **Appointment** - Scheduled appointments with reminders
- **MedicalRecord** - Clinical records (SOAP format)
- **Prescription** - Medication prescriptions with refill tracking
- **Invoice** - Billing invoices with unique invoice numbers
- **Payment** - Payment records with verification status
- **Refund** - Refund transactions with method selection
- **Admission** - Inpatient admissions with deposit tracking
- **Ward** / **Bed** - Ward and bed management with pricing
- **WellnessGoal** - Patient wellness goals and check-ins
- **WellnessVitals** - Patient vitals tracking
- **WellnessMedication** - Patient medication logging
- **WellnessMood** - Patient mood tracking
- **WellnessSleep** - Patient sleep tracking
- **WellnessSymptom** - Symptom tracking
- **WellnessReminder** - Medication and appointment reminders
- **AuditLog** - System audit trail with entity changes
- **Service** - Hospital services with pricing
- **InventoryBatch** - Medication batches with FEFO tracking
- **RadiologyRequest** - Imaging requests and reports
- **Surgery** - Surgery scheduling
- **Theater** - Operating theaters
- **LeaveBalance** - Staff leave balances
- **LeaveType** - Types of leave
- **VideoSession** - Telemedicine sessions

A reference schema is also available at [`schema.prisma.reference`](schema.prisma.reference).

---

## Deployment

### Backend (Render/Railway/Heroku)

1. Build the backend:

```bash
cd backend
npm run build

2. Set environment variables in your deployment platform:

   - `DATABASE_URL` - Production PostgreSQL connection
   - `JWT_SECRET` - Secure random string
   - `REFRESH_SECRET` - Secure random string
   - `FRONTEND_URL` - Your frontend URL

3. Start command:
```bash
npm start
```

### Frontend (Vercel/Netlify)

1. Build the frontend:

```bash
cd frontend
npm run build

2. The build output is in the `dist` folder.

3. Configure redirect for SPA (all routes to index.html).

**Vercel Configuration** (`vercel.json`):
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

---

## Troubleshooting

### Database Connection Issues

- Ensure PostgreSQL is running
- Verify `DATABASE_URL` is correct
- Check database user permissions

### Authentication Issues

- Verify JWT_SECRET and REFRESH_SECRET are set
- Check token expiration times
- Ensure Authorization header is sent with requests

### CORS Errors

- Add your frontend URL to `FRONTEND_URL` in backend .env
- Check allowed origins in backend/src/server.ts

### Port Already in Use

- Change PORT in .env file
- Or kill the process using the port: `npx kill-port 3000`

### Build Errors

- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Run `npx prisma generate` to regenerate client

---

## License

Proprietary Software. Internal Use Only.

---

## Support

For issues or questions, please contact the development team.
