# OltraHMS Backend

This is the backend API for the OltraHMS application, built with Node.js, Express, Prisma, and PostgreSQL.

## Quick Start

Please refer to the root [README.md](../README.md) for full project setup and documentation.

## Commands

From the `backend` directory, you can run:
*   `npm run dev`: Start development server with Nodemon
*   `npm run build`: Compile TypeScript to JavaScript
*   `npm start`: Run the compiled production server
*   `npx prisma studio`: Open database GUI

## New Features (March 2025)

### Queue Management System
- **Real-time Updates**: Socket.io integration for instant queue updates
- **Triage Gate**: Require vitals before doctor can call patients
- **Token Display API**: Endpoints for LCD/TV display screens
- **Patient Check-in**: Insurance validation with HMO verification

### API Endpoints

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

## HMO Verification Workflow

```
1. Patient adds insurance in profile
2. Status: PENDING (default)
3. Reception clicks "Verify" after phone confirmation
4. Status: VERIFIED / REJECTED
5. At check-in: system checks expiry + status
6. Warnings shown but check-in always allowed
```
