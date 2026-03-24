import {
  PrismaClient, Role, Status, Gender, AppointmentStatus, AppointmentType,
  MedicationRoute, DosageForm, LabPriority, LabStatus, BedStatus,
  PaymentMethod, PaymentStatus, InvoiceStatus, InsuranceStatus,
  NotificationChannel, NotificationPriority
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Comprehensive OltraHMS Seed...');

  // ─── CLEANUP ───────────────────────────────────────────────────────────────
  console.log('🧹 Cleaning up database...');
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.videoSession.deleteMany();
  await prisma.radiologyReport.deleteMany();
  await prisma.radiologyRequest.deleteMany();
  await prisma.labResult.deleteMany();
  await prisma.labOrder.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.insuranceClaim.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.dispensing.deleteMany();
  await prisma.medicationAdministration.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.inventoryBatch.deleteMany();
  await prisma.medication.deleteMany();
  await prisma.wardRound.deleteMany();
  await prisma.fluidBalance.deleteMany();
  await prisma.admission.deleteMany();
  await prisma.bed.deleteMany();
  await prisma.ward.deleteMany();
  await prisma.referral.deleteMany();
  await prisma.medicalRecord.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.patientInsurance.deleteMany();
  await prisma.triage.deleteMany();
  await prisma.vitalSigns.deleteMany();
  await prisma.symptomLog.deleteMany();
  await prisma.wellnessGoal.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.staffLeaveBalance.deleteMany();
  await prisma.leaveType.deleteMany();
  await prisma.payroll.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.department.deleteMany();
  await prisma.surgeryCase.deleteMany();
  await prisma.operatingTheater.deleteMany();
  await prisma.radiologyTest.deleteMany();
  await prisma.service.deleteMany();
  await prisma.user.deleteMany();

  // ─── HELPERS ───────────────────────────────────────────────────────────────
  const seedPassword = 'password123';
  const passwordHash = await bcrypt.hash(seedPassword, 12);
  const hireDate = new Date('2022-01-15');

  const daysAgo = (n: number) => new Date(Date.now() - n * 86400000);
  const hoursAgo = (n: number) => new Date(Date.now() - n * 3600000);
  const hoursAhead = (n: number) => new Date(Date.now() + n * 3600000);
  const daysAhead = (n: number) => new Date(Date.now() + n * 86400000);

  let invoiceCounter = 1;
  const nextInvoiceNumber = () => `INV-2025-${(invoiceCounter++).toString().padStart(4, '0')}`;

  // ─── DEPARTMENTS ───────────────────────────────────────────────────────────
  console.log('🏢 Creating Departments...');
  const departmentNames = [
    'General Medicine', 'Surgery', 'Pediatrics', 'Pharmacy',
    'Laboratory', 'Radiology', 'Nursing', 'Finance', 'HR', 'Reception'
  ];
  const deptMap = new Map<string, string>();
  for (const name of departmentNames) {
    const dept = await prisma.department.create({ data: { name, description: `${name} Department` } });
    deptMap.set(name, dept.id);
  }

  // ─── OPERATING THEATERS ────────────────────────────────────────────────────
  console.log('🔪 Creating Operating Theaters...');
  const theaters = await Promise.all([
    prisma.operatingTheater.create({ data: { name: 'Theater 1 — General', type: 'GENERAL', status: 'AVAILABLE' } }),
    prisma.operatingTheater.create({ data: { name: 'Theater 2 — Orthopedic', type: 'ORTHO', status: 'AVAILABLE' } }),
    prisma.operatingTheater.create({ data: { name: 'Theater 3 — Emergency', type: 'EMERGENCY', status: 'AVAILABLE' } }),
  ]);

  // ─── WARDS & BEDS ──────────────────────────────────────────────────────────
  console.log('🏥 Creating Wards and Beds...');
  const wardsData = [
    { name: 'General Male Ward', type: 'GENERAL', capacity: 10, basePrice: 5000 },
    { name: 'General Female Ward', type: 'GENERAL', capacity: 10, basePrice: 5000 },
    { name: 'Pediatrics Ward', type: 'PEDIATRICS', capacity: 6, basePrice: 8000 },
    { name: 'Intensive Care Unit (ICU)', type: 'ICU', capacity: 4, basePrice: 45000 },
    { name: 'Maternity Ward', type: 'MATERNITY', capacity: 8, basePrice: 15000 },
  ];
  const wardMap = new Map<string, string>();
  for (const w of wardsData) {
    const ward = await prisma.ward.create({ data: { name: w.name, type: w.type, capacity: w.capacity, basePrice: w.basePrice } });
    wardMap.set(ward.name, ward.id);
    for (let i = 1; i <= w.capacity; i++) {
      await prisma.bed.create({
        data: {
          wardId: ward.id,
          number: `${w.name.charAt(0).toUpperCase()}-${100 + i}`,
          type: w.type,
          price: w.type === 'ICU' ? w.basePrice + 5000 : null,
          status: i <= 2 ? BedStatus.OCCUPIED : BedStatus.VACANT_CLEAN,
        },
      });
    }
  }
  const allBeds = await prisma.bed.findMany();
  const vacantBeds = allBeds.filter(b => b.status === BedStatus.VACANT_CLEAN);
  const occupiedBeds = allBeds.filter(b => b.status === BedStatus.OCCUPIED);

  // ─── LEAVE TYPES ───────────────────────────────────────────────────────────
  console.log('🏖️ Creating Leave Types...');
  const leaveTypes = await Promise.all([
    prisma.leaveType.create({ data: { name: 'Annual Leave', defaultDays: 21, isPaid: true } }),
    prisma.leaveType.create({ data: { name: 'Sick Leave', defaultDays: 14, isPaid: true } }),
    prisma.leaveType.create({ data: { name: 'Maternity Leave', defaultDays: 90, isPaid: true } }),
    prisma.leaveType.create({ data: { name: 'Unpaid Leave', defaultDays: 30, isPaid: false } }),
  ]);

  const seedLeaveBalances = async (staffId: string) => {
    for (const lt of leaveTypes) {
      await prisma.staffLeaveBalance.create({
        data: { staffId, leaveTypeId: lt.id, allocatedDays: lt.defaultDays, usedDays: 0 },
      });
    }
  };

  // ─── SERVICES ──────────────────────────────────────────────────────────────
  console.log('🩺 Creating Services...');
  const servicesData = [
    { name: 'General Consultation', type: 'CONSULTATION' as const, price: 15000 },
    { name: 'Specialist Consultation', type: 'CONSULTATION' as const, price: 25000 },
    { name: 'Telemedicine Consultation', type: 'CONSULTATION' as const, price: 10000 },
    { name: 'Full Blood Count', type: 'LAB' as const, price: 8000, code: 'LAB-FBC' },
    { name: 'Liver Function Test', type: 'LAB' as const, price: 12000, code: 'LAB-LFT' },
    { name: 'Malaria Parasite Test', type: 'LAB' as const, price: 3000, code: 'LAB-MP' },
    { name: 'HIV Screening', type: 'LAB' as const, price: 5000, code: 'LAB-HIV' },
    { name: 'Blood Glucose (Fasting)', type: 'LAB' as const, price: 2500, code: 'LAB-GLU' },
    { name: 'Appendectomy', type: 'PROCEDURE' as const, price: 250000, code: 'PROC-APP' },
    { name: 'Caesarean Section', type: 'PROCEDURE' as const, price: 450000, code: 'PROC-CS' },
    { name: 'Chest X-Ray', type: 'PROCEDURE' as const, price: 10000 },
    { name: 'Abdominal Ultrasound', type: 'PROCEDURE' as const, price: 15000 },
    { name: 'Ward Admission (Daily)', type: 'ADMISSION' as const, price: 5000 },
    { name: 'ICU (Daily)', type: 'ADMISSION' as const, price: 50000 },
  ];
  for (const s of servicesData) {
    await prisma.service.create({ data: s });
  }

  // ─── RADIOLOGY TESTS ───────────────────────────────────────────────────────
  const radiologyTests = [
    { name: 'Chest X-Ray', code: 'RAD-CXR', price: 10000, modality: 'XRAY' },
    { name: 'Brain MRI', code: 'RAD-MRI-B', price: 75000, modality: 'MRI' },
    { name: 'Abdominal Ultrasound', code: 'RAD-US-A', price: 15000, modality: 'ULTRASOUND' },
    { name: 'Pelvis CT Scan', code: 'RAD-CT-P', price: 60000, modality: 'CT' },
  ];
  const radTestMap = new Map<string, string>();
  for (const rt of radiologyTests) {
    const res = await prisma.radiologyTest.create({ data: rt });
    radTestMap.set(rt.code, res.id);
  }

  // ─── MEDICATIONS & INVENTORY ───────────────────────────────────────────────
  console.log('💊 Creating Medications & Inventory...');
  const medicationsData = [
    { name: 'Paracetamol 500mg', dosageForm: DosageForm.TABLET, price: 500, reorderLevel: 200, category: 'Analgesic' },
    { name: 'Amoxicillin 250mg', dosageForm: DosageForm.CAPSULE, price: 1500, reorderLevel: 100, category: 'Antibiotic' },
    { name: 'Artemether-Lumefantrine', dosageForm: DosageForm.TABLET, price: 2500, reorderLevel: 100, category: 'Antimalarial' },
    { name: 'Ibuprofen 400mg', dosageForm: DosageForm.TABLET, price: 800, reorderLevel: 150, category: 'NSAID' },
    { name: 'Ceftriaxone 1g', dosageForm: DosageForm.INJECTION, price: 3500, reorderLevel: 50, category: 'Antibiotic' },
    { name: 'Metformin 500mg', dosageForm: DosageForm.TABLET, price: 1200, reorderLevel: 80, category: 'Antidiabetic' },
    { name: 'Amlodipine 5mg', dosageForm: DosageForm.TABLET, price: 900, reorderLevel: 80, category: 'Antihypertensive' },
    { name: 'Omeprazole 20mg', dosageForm: DosageForm.CAPSULE, price: 600, reorderLevel: 120, category: 'Antacid' },
    { name: 'Diazepam 5mg', dosageForm: DosageForm.TABLET, price: 700, reorderLevel: 60, category: 'Anxiolytic' },
    { name: 'IV Normal Saline 0.9%', dosageForm: DosageForm.OTHER, price: 1500, reorderLevel: 100, category: 'IV Fluid' },
  ];
  const medicationObjects: any[] = [];
  for (let i = 0; i < medicationsData.length; i++) {
    const med = medicationsData[i];
    const createdMed = await prisma.medication.create({ data: med });
    medicationObjects.push(createdMed);
    // Two batches per medication — FEFO demo
    await prisma.inventoryBatch.create({
      data: {
        medicationId: createdMed.id,
        batchNumber: `BATCH-A${2025000 + i}`,
        quantity: 300,
        expiryDate: new Date('2026-06-30'),
        costPrice: createdMed.price * 0.65,
      },
    });
    await prisma.inventoryBatch.create({
      data: {
        medicationId: createdMed.id,
        batchNumber: `BATCH-B${2025000 + i}`,
        quantity: 500,
        expiryDate: new Date('2028-12-31'),
        costPrice: createdMed.price * 0.6,
      },
    });
  }

  // ─── ADMIN ─────────────────────────────────────────────────────────────────
  console.log('👨‍💼 Creating Admin...');
  const adminUser = await prisma.user.create({
    data: { email: 'admin@oltrahms.com', firstName: 'Chukwuemeka', lastName: 'Okafor', role: Role.ADMIN, status: Status.ACTIVE, passwordHash },
  });
  const adminStaff = await prisma.staff.create({
    data: { userId: adminUser.id, staffNumber: 'ADM-001', specialization: 'Administration', departmentId: deptMap.get('HR'), hireDate, baseSalary: 1200000 },
  });
  await seedLeaveBalances(adminStaff.id);

  // ─── DOCTORS ───────────────────────────────────────────────────────────────
  console.log('👨‍⚕️ Creating Doctors...');
  const doctorSpecs = [
    { email: 'doctor@oltrahms.com', first: 'Adebayo', last: 'Ogundimu', spec: 'Internal Medicine', dept: 'General Medicine', sal: 950000 },
    { email: 'doctor2@oltrahms.com', first: 'Ngozi', last: 'Adeyemi', spec: 'General Surgery', dept: 'Surgery', sal: 1100000 },
    { email: 'doctor3@oltrahms.com', first: 'Emeka', last: 'Nwosu', spec: 'Pediatrics', dept: 'Pediatrics', sal: 900000 },
    { email: 'doctor4@oltrahms.com', first: 'Fatima', last: 'Bello', spec: 'Cardiology', dept: 'General Medicine', sal: 1200000 },
    { email: 'doctor5@oltrahms.com', first: 'Oluwaseun', last: 'Adesanya', spec: 'Obstetrics & Gynaecology', dept: 'Surgery', sal: 1050000 },
  ];
  const doctors: any[] = [];
  for (let i = 0; i < doctorSpecs.length; i++) {
    const d = doctorSpecs[i];
    const user = await prisma.user.create({
      data: { email: d.email, firstName: d.first, lastName: d.last, role: Role.DOCTOR, status: Status.ACTIVE, passwordHash },
    });
    const staff = await prisma.staff.create({
      data: { userId: user.id, staffNumber: `DOC-2025${i + 1}`, specialization: d.spec, departmentId: deptMap.get(d.dept), hireDate, baseSalary: d.sal },
    });
    await seedLeaveBalances(staff.id);
    doctors.push({ user, staff });
  }

  // ─── OTHER STAFF ───────────────────────────────────────────────────────────
  console.log('👩‍⚕️ Creating Other Staff...');
  const otherStaffData = [
    { email: 'pharmacist@oltrahms.com', first: 'Amara', last: 'Obi', role: Role.PHARMACIST, dept: 'Pharmacy', spec: 'Clinical Pharmacy', num: 'PHM-001', sal: 550000 },
    { email: 'labtech@oltrahms.com', first: 'Tunde', last: 'Fashola', role: Role.LAB_TECH, dept: 'Laboratory', spec: 'Clinical Pathology', num: 'LAB-001', sal: 450000 },
    { email: 'nurse@oltrahms.com', first: 'Blessing', last: 'Eze', role: Role.NURSE, dept: 'Nursing', spec: 'General Nursing', num: 'NUR-001', sal: 380000 },
    { email: 'nurse2@oltrahms.com', first: 'Chidinma', last: 'Okeke', role: Role.NURSE, dept: 'Nursing', spec: 'ICU Nursing', num: 'NUR-002', sal: 420000 },
    { email: 'receptionist@oltrahms.com', first: 'Aisha', last: 'Mohammed', role: Role.RECEPTIONIST, dept: 'Reception', spec: 'Front Desk', num: 'REC-001', sal: 220000 },
    { email: 'accountant@oltrahms.com', first: 'Kelechi', last: 'Nwachukwu', role: Role.ACCOUNTANT, dept: 'Finance', spec: 'Healthcare Accounting', num: 'FIN-001', sal: 600000 },
    { email: 'insurance@oltrahms.com', first: 'Usman', last: 'Garba', role: Role.INSURANCE_OFFICER, dept: 'Finance', spec: 'HMO Officer', num: 'FIN-002', sal: 480000 },
    { email: 'radiologist@oltrahms.com', first: 'Yetunde', last: 'Adeniyi', role: Role.RADIOLOGIST, dept: 'Radiology', spec: 'Diagnostic Radiology', num: 'RAD-001', sal: 850000 },
  ];
  const staffMap = new Map<string, any>();
  for (const s of otherStaffData) {
    const user = await prisma.user.create({
      data: { email: s.email, firstName: s.first, lastName: s.last, role: s.role, status: Status.ACTIVE, passwordHash },
    });
    const staff = await prisma.staff.create({
      data: { userId: user.id, staffNumber: s.num, specialization: s.spec, departmentId: deptMap.get(s.dept), hireDate, baseSalary: s.sal },
    });
    await seedLeaveBalances(staff.id);
    staffMap.set(s.role, staff);
    staffMap.set(s.email, staff); // also by email for precision
  }

  const pharmacistStaff = staffMap.get('pharmacist@oltrahms.com');
  const labTechStaff = staffMap.get('labtech@oltrahms.com');
  const nurseStaff = staffMap.get('nurse@oltrahms.com');
  const nurse2Staff = staffMap.get('nurse2@oltrahms.com');
  const radiologistStaff = staffMap.get('radiologist@oltrahms.com');
  const accountantStaff = staffMap.get('accountant@oltrahms.com');

  // ─── PAYROLL ───────────────────────────────────────────────────────────────
  console.log('💰 Creating Payroll Records...');
  const allStaffArray = [adminStaff];
  for (const d of doctors) { allStaffArray.push(d.staff); }
  const staffMapValues = Array.from(staffMap.values());
  for (const s of staffMapValues) { allStaffArray.push(s); }
  const uniqueStaff = Array.from(new Map(allStaffArray.map(s => [s.id, s])).values());
  for (const staff of uniqueStaff) {
    const baseSalary = staff.baseSalary || 0;
    await prisma.payroll.create({
      data: {
        staffId: staff.id,
        month: 'February', year: 2025,
        baseSalary: baseSalary,
        bonuses: baseSalary * 0.1,
        deductions: baseSalary * 0.075,
        netSalary: baseSalary + baseSalary * 0.1 - baseSalary * 0.075,
        status: 'PAID',
        paymentDate: daysAgo(10),
        currency: 'NGN',
      },
    });
    // March payroll pending
    await prisma.payroll.create({
      data: {
        staffId: staff.id,
        month: 'March', year: 2025,
        baseSalary: baseSalary,
        bonuses: baseSalary * 0.1,
        deductions: baseSalary * 0.075,
        netSalary: baseSalary + baseSalary * 0.1 - baseSalary * 0.075,
        status: 'PENDING',
        currency: 'NGN',
      },
    });
  }

  // ─── LEAVE REQUESTS ────────────────────────────────────────────────────────
  console.log('✈️ Creating Leave Requests...');
  await prisma.leaveRequest.create({
    data: {
      staffId: nurseStaff.id, leaveTypeId: leaveTypes[0].id,
      startDate: daysAhead(10), endDate: daysAhead(20),
      days: 10, reason: 'Family Vacation', status: 'PENDING',
    },
  });
  await prisma.leaveRequest.create({
    data: {
      staffId: doctors[2].staff.id, leaveTypeId: leaveTypes[1].id,
      startDate: daysAgo(5), endDate: daysAgo(2),
      days: 3, reason: 'Medical recovery', status: 'APPROVED',
    },
  });

  // ─── PATIENTS ──────────────────────────────────────────────────────────────
  console.log('🤒 Creating Patients...');
  const patientData = [
    { email: 'patient@oltrahms.com', first: 'Emeka', last: 'Okafor', gender: Gender.MALE, dob: '1990-05-15', bg: 'O_POSITIVE', phone: '+2348012345678', addr: '14 Adeyemo Alkali Street, Victoria Island, Lagos' },
    { email: 'patient2@oltrahms.com', first: 'Amara', last: 'Nwosu', gender: Gender.FEMALE, dob: '1985-08-22', bg: 'A_POSITIVE', phone: '+2348023456789', addr: '7 Balogun Street, Lagos Island, Lagos' },
    { email: 'patient3@oltrahms.com', first: 'Taiwo', last: 'Adeleke', gender: Gender.MALE, dob: '2012-12-01', bg: 'B_NEGATIVE', phone: '+2348034567890', addr: '22 Awolowo Road, Ikoyi, Lagos' },
    { email: 'patient4@oltrahms.com', first: 'Ngozi', last: 'Eze', gender: Gender.FEMALE, dob: '1995-03-10', bg: 'AB_POSITIVE', phone: '+2348045678901', addr: '5 Broad Street, Lagos Island, Lagos' },
    { email: 'patient5@oltrahms.com', first: 'Musa', last: 'Ibrahim', gender: Gender.MALE, dob: '1970-11-25', bg: 'O_NEGATIVE', phone: '+2348056789012', addr: '33 Kano Road, Ikeja, Lagos' },
    { email: 'patient6@oltrahms.com', first: 'Funke', last: 'Adesola', gender: Gender.FEMALE, dob: '1988-07-14', bg: 'A_NEGATIVE', phone: '+2348067890123', addr: '11 Obafemi Awolowo Way, Ikeja, Lagos' },
    { email: 'patient7@oltrahms.com', first: 'Chidi', last: 'Okeke', gender: Gender.MALE, dob: '1975-02-20', bg: 'B_POSITIVE', phone: '+2348078901234', addr: '18 Marina Street, Lagos Island, Lagos' },
    { email: 'patient8@oltrahms.com', first: 'Halima', last: 'Abubakar', gender: Gender.FEMALE, dob: '2000-09-05', bg: 'O_POSITIVE', phone: '+2348089012345', addr: '9 Ikorodu Road, Maryland, Lagos' },
  ];
  const patients: any[] = [];
  for (let i = 0; i < patientData.length; i++) {
    const p = patientData[i];
    const pUser = await prisma.user.create({
      data: { email: p.email, firstName: p.first, lastName: p.last, role: Role.PATIENT, status: Status.ACTIVE, passwordHash },
    });
    const patient = await prisma.patient.create({
      data: {
        userId: pUser.id,
        patientNumber: `HMS-2025-${(i + 1).toString().padStart(4, '0')}`,
        firstName: p.first, lastName: p.last,
        dateOfBirth: new Date(p.dob),
        gender: p.gender,
        bloodGroup: p.bg as any,
        phone: p.phone,
        address: p.addr,
      },
    });
    patients.push(patient);
  }

  // ─── PATIENT INSURANCE ─────────────────────────────────────────────────────
  console.log('🏥 Adding Patient Insurance...');
  await prisma.patientInsurance.create({
    data: {
      patientId: patients[0].id, 
      provider: 'NHIS', 
      planName: 'Federal Government Employee',
      policyNumber: 'NHIS-FGE-001234', 
      groupNumber: 'GRP-FGN-001',
      coveragePercentage: 80,
      validFrom: new Date('2024-01-01'), 
      validUntil: new Date('2026-12-31'),
      status: InsuranceStatus.ACTIVE, 
    },
  });
  await prisma.patientInsurance.create({
    data: {
      patientId: patients[1].id, 
      provider: 'Hygeia HMO', 
      planName: 'Comprehensive Plus',
      policyNumber: 'HYG-C-567890', 
      groupNumber: 'GRP-HYG-002',
      coveragePercentage: 70,
      validFrom: new Date('2024-03-01'), 
      validUntil: new Date('2025-02-28'),
      status: InsuranceStatus.EXPIRED, 
    },
  });
  await prisma.patientInsurance.create({
    data: {
      patientId: patients[3].id, 
      provider: 'Reliance HMO', 
      planName: 'Basic Care',
      policyNumber: 'REL-B-112233', 
      groupNumber: 'GRP-REL-003',
      coveragePercentage: 60,
      validFrom: new Date('2025-01-01'), 
      validUntil: new Date('2026-12-31'),
      status: InsuranceStatus.ACTIVE, 
    },
  });

  // ─── WELLNESS TRACKING ─────────────────────────────────────────────────────
  console.log('💪 Creating Wellness Tracking Data...');
  const wellnessGoal = await prisma.wellnessGoal.create({
    data: {
      patientId: patients[0].id, description: 'Keep systolic BP below 130 mmHg', category: 'General', targetDate: daysAhead(90),
      status: 'IN_PROGRESS',
    },
  });
  // Vitals over last week
  for (let d = 6; d >= 0; d--) {
    await prisma.vitalSigns.create({
      data: {
        patientId: patients[0].id,
        temperature: 36.5 + Math.random() * 0.8,
        bpSystolic: 125 + Math.floor(Math.random() * 15),
        bpDiastolic: 80 + Math.floor(Math.random() * 10),
        heartRate: 72 + Math.floor(Math.random() * 10),
        oxygenSaturation: 97 + Math.floor(Math.random() * 3),
        weight: 78.5,
        recordedAt: daysAgo(d),
      },
    });
  }

  // ─── FLOW 1: COMPLETED OUTPATIENT — MALARIA ────────────────────────────────
  console.log('🔄 Flow 1: Completed Outpatient Malaria Case...');
  const appt1 = await prisma.appointment.create({
    data: {
      patientId: patients[0].id, doctorId: doctors[0].staff.id,
      appointmentDate: daysAgo(3), startTime: daysAgo(3), endTime: new Date(daysAgo(3).getTime() + 30 * 60000),
      type: AppointmentType.FIRST_VISIT, status: AppointmentStatus.COMPLETED,
      reason: 'Fever and headaches for 3 days',
    },
  });
  const record1 = await prisma.medicalRecord.create({
    data: {
      patientId: patients[0].id, doctorId: doctors[0].staff.id, appointmentId: appt1.id,
      subjective: { chiefComplaint: 'Fever for 3 days', historyOfPresentIllness: 'Associated with chills and sweating. No cough. No vomiting.' },
      objective: { physicalExamination: 'Temperature 39.2°C, mild pallor, no jaundice. Abdomen: mild splenomegaly.' },
      assessment: { primaryDiagnosis: 'Acute Plasmodium Falciparum Malaria', differentialDiagnosis: 'Typhoid Fever' },
      plan: { treatment: 'Artemether-Lumefantrine 6-dose regimen', followUp: 'Review in 1 week' },
    },
  });
  const presc1 = await prisma.prescription.create({
    data: {
      medicalRecordId: record1.id, patientId: patients[0].id,
      medicationName: 'Artemether-Lumefantrine', dosage: '4 tablets', frequency: 'Twice daily for 3 days',
      route: MedicationRoute.ORAL, duration: 3, quantity: 24, status: 'DISPENSED' as any, refillsRemaining: 0,
    },
  });
  const presc1b = await prisma.prescription.create({
    data: {
      medicalRecordId: record1.id, patientId: patients[0].id,
      medicationName: 'Paracetamol 500mg', dosage: '2 tablets', frequency: 'Every 6 hours as needed',
      route: MedicationRoute.ORAL, duration: 5, quantity: 20, status: 'DISPENSED' as any, refillsRemaining: 0,
    },
  });
  await prisma.dispensing.create({
    data: {
      prescriptionId: presc1.id, medicationId: medicationObjects[2].id,
      batchNumber: `BATCH-A${2025002}`, quantity: 24, dispensedById: pharmacistStaff.id,
    },
  });
  await prisma.dispensing.create({
    data: {
      prescriptionId: presc1b.id, medicationId: medicationObjects[0].id,
      batchNumber: `BATCH-A${2025000}`, quantity: 20, dispensedById: pharmacistStaff.id,
    },
  });
  const inv1Total = 15000 + (2500 * 24) + (500 * 20);
  const inv1 = await prisma.invoice.create({
    data: {
      invoiceNumber: nextInvoiceNumber(), patientId: patients[0].id, medicalRecordId: record1.id,
      items: [
        { description: 'General Consultation', amount: 15000, quantity: 1, type: 'CONSULTATION' },
        { description: 'Artemether-Lumefantrine x24', amount: 2500 * 24, quantity: 24, type: 'PHARMACY' },
        { description: 'Paracetamol 500mg x20', amount: 500 * 20, quantity: 20, type: 'PHARMACY' },
      ],
      subtotal: inv1Total, tax: 0, total: inv1Total,
      balance: 0, amountPaid: inv1Total, status: InvoiceStatus.PAID,
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv1.id, amount: inv1Total,
      method: PaymentMethod.CASH, processedById: adminUser.id, status: PaymentStatus.COMPLETED,
      paidAt: daysAgo(3),
    },
  });

  // ─── FLOW 2: INPATIENT ADMISSION — APPENDICITIS ────────────────────────────
  console.log('🔄 Flow 2: Inpatient Admission — Appendicitis...');
  const appt2 = await prisma.appointment.create({
    data: {
      patientId: patients[1].id, doctorId: doctors[1].staff.id,
      appointmentDate: daysAgo(2), startTime: daysAgo(2), endTime: new Date(daysAgo(2).getTime() + 45 * 60000),
      type: AppointmentType.EMERGENCY, status: AppointmentStatus.COMPLETED,
      reason: 'Severe right lower abdominal pain',
    },
  });
  const record2 = await prisma.medicalRecord.create({
    data: {
      patientId: patients[1].id, doctorId: doctors[1].staff.id, appointmentId: appt2.id,
      subjective: { chiefComplaint: 'Severe RLQ pain for 12 hours', historyOfPresentIllness: 'Sudden onset, worsened with movement. Associated with nausea and low-grade fever.' },
      objective: { physicalExamination: 'Guarding and rebound tenderness at McBurney\'s point. Temp 38.1°C. WBC elevated.' },
      assessment: { primaryDiagnosis: 'Acute Appendicitis', icd10: 'K37' },
      plan: { treatment: 'Emergency Appendectomy', preOpOrders: 'NBM, IV Ceftriaxone 1g, IV fluids' },
    },
  });
  // Lab order
  const labOrder1 = await prisma.labOrder.create({
    data: {
      medicalRecordId: record2.id, patientId: patients[1].id,
      testName: 'Full Blood Count', testCode: 'LAB-FBC',
      priority: LabPriority.URGENT, status: LabStatus.COMPLETED,
      orderedAt: daysAgo(2), completedAt: new Date(daysAgo(2).getTime() + 2 * 3600000),
    },
  });
  await prisma.labResult.create({
    data: {
      labOrderId: labOrder1.id, uploadedById: labTechStaff.id,
      resultData: { WBC: '18.2 x10³/μL (HIGH)', Haemoglobin: '13.1 g/dL', Platelets: '280 x10³/μL', Neutrophils: '85%' },
      criticalFlags: ['Elevated WBC — suggestive of bacterial infection'],
      aiInterpretation: 'Leukocytosis consistent with acute bacterial infection',
    },
  });
  // Admission
  const admBed = occupiedBeds[0];
  const admission2 = await prisma.admission.create({
    data: {
      patientId: patients[1].id, bedId: admBed.id, admittedById: adminUser.id,
      reason: 'Post-operative care following emergency appendectomy',
      status: 'ADMITTED',
    },
  });
  await prisma.wardRound.create({
    data: {
      admissionId: admission2.id, conductedById: nurseStaff.id,
      notes: 'Patient recovering well post-op. Wound site clean. Pain controlled on analgesics. Vitals stable. Tolerating sips of water.',
    },
  });
  await prisma.fluidBalance.create({
    data: {
      patientId: patients[1].id, recordedById: nurse2Staff.id,
      type: 'INTAKE', fluidType: 'Normal Saline', amount: 2500,
    },
  });
  // IV prescription
  const presc2 = await prisma.prescription.create({
    data: {
      medicalRecordId: record2.id, patientId: patients[1].id,
      medicationName: 'Ceftriaxone 1g', dosage: '1g IV', frequency: 'Every 12 hours',
      route: MedicationRoute.IV, duration: 5, quantity: 10, status: 'PENDING' as any,
    },
  });
  await prisma.medicationAdministration.create({
    data: {
      prescriptionId: presc2.id, patientId: patients[1].id, administeredById: nurseStaff.id,
      scheduledTime: hoursAgo(6), administeredTime: hoursAgo(6),
      status: 'GIVEN',
    },
  });
  // Surgery
  await prisma.surgeryCase.create({
    data: {
      patientId: patients[1].id, theaterId: theaters[0].id,
      leadSurgeonId: doctors[1].staff.id,
      scheduledStart: new Date(daysAgo(2).getTime() + 3 * 3600000),
      scheduledEnd: new Date(daysAgo(2).getTime() + 5 * 3600000),
      status: 'COMPLETED', notes: 'Perforated appendix. Peritoneal washout performed. Good prognosis.',
      priority: 'EMERGENCY',
    },
  });
  const inv2Total = 25000 + 8000 + 250000 + 50000;
  const inv2 = await prisma.invoice.create({
    data: {
      invoiceNumber: nextInvoiceNumber(), patientId: patients[1].id, medicalRecordId: record2.id,
      items: [
        { description: 'Specialist Consultation (Surgery)', amount: 25000, quantity: 1, type: 'CONSULTATION' },
        { description: 'Full Blood Count — Urgent', amount: 8000, quantity: 1, type: 'LAB' },
        { description: 'Emergency Appendectomy', amount: 250000, quantity: 1, type: 'PROCEDURE' },
        { description: 'Ward Admission Deposit', amount: 50000, quantity: 1, type: 'ADMISSION' },
      ],
      subtotal: inv2Total, tax: 0, total: inv2Total,
      balance: 283000, amountPaid: 50000, status: InvoiceStatus.PARTIAL,
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv2.id, amount: 50000,
      method: PaymentMethod.BANK_TRANSFER, processedById: adminUser.id, status: PaymentStatus.COMPLETED,
      paidAt: daysAgo(2),
    },
  });

  // ─── FLOW 3: TELEMEDICINE — HYPERTENSION FOLLOW-UP ────────────────────────
  console.log('🔄 Flow 3: Telemedicine — Hypertension Follow-up...');
  const appt3 = await prisma.appointment.create({
    data: {
      patientId: patients[3].id, doctorId: doctors[3].staff.id,
      appointmentDate: hoursAhead(2), startTime: hoursAhead(2), endTime: hoursAhead(3),
      type: AppointmentType.FOLLOW_UP, status: AppointmentStatus.CONFIRMED,
      reason: 'Hypertension medication review — telemedicine',
      notes: 'Patient requested virtual consultation due to distance',
    },
  });
  await prisma.videoSession.create({
    data: {
      appointmentId: appt3.id,
      roomId: `oltra-consult-${appt3.id.substring(0, 8)}`,
      status: 'ACTIVE',
    },
  });

  // Completed telemedicine session from last week
  const appt3b = await prisma.appointment.create({
    data: {
      patientId: patients[3].id, doctorId: doctors[3].staff.id,
      appointmentDate: daysAgo(7), startTime: daysAgo(7), endTime: new Date(daysAgo(7).getTime() + 30 * 60000),
      type: AppointmentType.FOLLOW_UP, status: AppointmentStatus.COMPLETED,
      reason: 'Monthly BP review',
    },
  });
  const videoSession2 = await prisma.videoSession.create({
    data: {
      appointmentId: appt3b.id,
      roomId: `oltra-consult-${appt3b.id.substring(0, 8)}`,
      status: 'ENDED',
      startedAt: daysAgo(7),
      endedAt: new Date(daysAgo(7).getTime() + 28 * 60000),
    },
  });
  const record3 = await prisma.medicalRecord.create({
    data: {
      patientId: patients[3].id, doctorId: doctors[3].staff.id, appointmentId: appt3b.id,
      subjective: { chiefComplaint: 'Monthly BP review', historyOfPresentIllness: 'Patient reports BP readings at home averaging 128/82 mmHg. No headaches. Tolerating Amlodipine well.' },
      objective: { physicalExamination: 'Telemedicine consultation. Patient appears well. Reports no adverse effects from medication.' },
      assessment: { primaryDiagnosis: 'Hypertension — controlled', icd10: 'I10' },
      plan: { treatment: 'Continue Amlodipine 5mg daily', followUp: 'Review in 4 weeks. Review bloods in 3 months.' },
    },
  });
  await prisma.prescription.create({
    data: {
      medicalRecordId: record3.id, patientId: patients[3].id,
      medicationName: 'Amlodipine 5mg', dosage: '1 tablet', frequency: 'Once daily',
      route: MedicationRoute.ORAL, duration: 30, quantity: 30, status: 'PENDING' as any, refillsRemaining: 2,
    },
  });
  const inv3Total = 10000;
  const inv3 = await prisma.invoice.create({
    data: {
      invoiceNumber: nextInvoiceNumber(), patientId: patients[3].id, medicalRecordId: record3.id,
      items: [{ description: 'Telemedicine Consultation', amount: 10000, quantity: 1, type: 'CONSULTATION' }],
      subtotal: inv3Total, tax: 0, total: inv3Total,
      balance: 0, amountPaid: inv3Total, status: InvoiceStatus.PAID,
    },
  });
  await prisma.payment.create({
    data: {
      invoiceId: inv3.id, amount: inv3Total,
      method: PaymentMethod.BANK_TRANSFER, processedById: adminUser.id, status: PaymentStatus.COMPLETED,
      paidAt: daysAgo(7),
    },
  });

  // ─── FLOW 4: RADIOLOGY — CHEST X-RAY + BRAIN MRI ──────────────────────────
  console.log('🔄 Flow 4: Radiology Requests...');
  const radReq1 = await prisma.radiologyRequest.create({
    data: {
      patientId: patients[2].id, doctorId: doctors[0].staff.id,
      testId: radTestMap.get('RAD-CXR') || '',
      status: 'COMPLETED', priority: 'ROUTINE', notes: 'Persistent cough for 6 weeks, rule out PTT',
    },
  });
  await prisma.radiologyReport.create({
    data: {
      requestId: radReq1.id, radiologistId: radiologistStaff.id,
      findings: 'Clear lung fields bilaterally. No consolidation, effusion or pneumothorax. Cardiac silhouette normal. No hilar lymphadenopathy.',
      impression: 'Normal Chest X-Ray. No radiological evidence of pulmonary tuberculosis.',
      imageUrls: [],
    },
  });
  const radReq2 = await prisma.radiologyRequest.create({
    data: {
      patientId: patients[4].id, doctorId: doctors[3].staff.id,
      testId: radTestMap.get('RAD-MRI-B') || '',
      status: 'PENDING', priority: 'URGENT', notes: 'New onset severe headache with visual disturbance',
    },
  });

  // ─── FLOW 5: PEDIATRIC APPOINTMENT ────────────────────────────────────────
  console.log('🔄 Flow 5: Pediatric Consultation...');
  const appt5 = await prisma.appointment.create({
    data: {
      patientId: patients[2].id, doctorId: doctors[2].staff.id,
      appointmentDate: daysAgo(1), startTime: daysAgo(1), endTime: new Date(daysAgo(1).getTime() + 30 * 60000),
      type: AppointmentType.FIRST_VISIT, status: AppointmentStatus.COMPLETED,
      reason: 'Childhood fever and rash',
    },
  });
  const record5 = await prisma.medicalRecord.create({
    data: {
      patientId: patients[2].id, doctorId: doctors[2].staff.id, appointmentId: appt5.id,
      subjective: { chiefComplaint: 'Fever and rash for 2 days', historyOfPresentIllness: 'Maculopapular rash starting on face, now on trunk. High fever 38.8°C. Up to date on vaccinations.' },
      objective: { physicalExamination: 'Alert child. Maculopapular rash on face and trunk. Mild conjunctival injection. Cervical lymphadenopathy. Temp 38.8°C.' },
      assessment: { primaryDiagnosis: 'Viral Exanthem — likely Measles', icd10: 'B05' },
      plan: { treatment: 'Supportive care — Paracetamol, Vitamin A supplementation, isolation', followUp: 'Review in 3 days' },
    },
  });

  // ─── FLOW 6: UPCOMING APPOINTMENTS (for queue demo) ───────────────────────
  console.log('🔄 Flow 6: Upcoming Appointments for Queue Demo...');
  const upcomingAppts = [
    { patient: patients[5], doctor: doctors[0], reason: 'Annual checkup', type: AppointmentType.FIRST_VISIT },
    { patient: patients[6], doctor: doctors[1], reason: 'Post-surgery follow-up', type: AppointmentType.FOLLOW_UP },
    { patient: patients[7], doctor: doctors[4], reason: 'Antenatal visit — 28 weeks', type: AppointmentType.FIRST_VISIT },
  ];
  for (let i = 0; i < upcomingAppts.length; i++) {
    const apptData = upcomingAppts[i];
    await prisma.appointment.create({
      data: {
        patientId: apptData.patient.id, doctorId: apptData.doctor.staff.id,
        appointmentDate: hoursAhead(i + 1),
        startTime: hoursAhead(i + 1),
        endTime: new Date(hoursAhead(i + 1).getTime() + 30 * 60000),
        type: apptData.type, status: AppointmentStatus.CONFIRMED,
        reason: apptData.reason,
      },
    });
  }

  // ─── FLOW 7: DIABETES MANAGEMENT — PENDING LAB ────────────────────────────
  console.log('🔄 Flow 7: Diabetes Management...');
  const appt7 = await prisma.appointment.create({
    data: {
      patientId: patients[4].id, doctorId: doctors[0].staff.id,
      appointmentDate: daysAgo(1), startTime: daysAgo(1), endTime: new Date(daysAgo(1).getTime() + 45 * 60000),
      type: AppointmentType.FOLLOW_UP, status: AppointmentStatus.COMPLETED,
      reason: 'Diabetes review — 3 monthly check',
    },
  });
  const record7 = await prisma.medicalRecord.create({
    data: {
      patientId: patients[4].id, doctorId: doctors[0].staff.id, appointmentId: appt7.id,
      subjective: { chiefComplaint: 'Routine diabetes follow-up', historyOfPresentIllness: 'Patient reports home glucose readings between 7-10 mmol/L. Good compliance with medication. Occasional nocturia.' },
      objective: { physicalExamination: 'BP 136/84 mmHg. BMI 29. Peripheral pulses intact. No foot ulcers. Fundoscopy normal.' },
      assessment: { primaryDiagnosis: 'Type 2 Diabetes Mellitus — suboptimal control', icd10: 'E11' },
      plan: { treatment: 'Increase Metformin to 1g BD. Dietary counselling. Refer to dietitian.', investigations: 'HbA1c, Fasting glucose, Renal function' },
    },
  });
  const labOrder7 = await prisma.labOrder.create({
    data: {
      medicalRecordId: record7.id, patientId: patients[4].id,
      testName: 'Blood Glucose (Fasting)', testCode: 'LAB-GLU',
      priority: LabPriority.ROUTINE, status: LabStatus.PENDING,
      orderedAt: daysAgo(1),
    },
  });
  await prisma.prescription.create({
    data: {
      medicalRecordId: record7.id, patientId: patients[4].id,
      medicationName: 'Metformin 500mg', dosage: '2 tablets', frequency: 'Twice daily with meals',
      route: MedicationRoute.ORAL, duration: 90, quantity: 180, status: 'PENDING' as any, refillsRemaining: 3,
    },
  });
  const inv7Total = 15000 + 2500;
  const inv7 = await prisma.invoice.create({
    data: {
      invoiceNumber: nextInvoiceNumber(), patientId: patients[4].id, medicalRecordId: record7.id,
      items: [
        { description: 'General Consultation', amount: 15000, quantity: 1, type: 'CONSULTATION' },
        { description: 'Blood Glucose (Fasting)', amount: 2500, quantity: 1, type: 'LAB' },
      ],
      subtotal: inv7Total, tax: 0, total: inv7Total,
      balance: inv7Total, amountPaid: 0, status: InvoiceStatus.ISSUED,
    },
  });

  // ─── FLOW 8: MATERNITY — C-SECTION SCHEDULED ──────────────────────────────
  console.log('🔄 Flow 8: Maternity — Caesarean Section...');
  const appt8 = await prisma.appointment.create({
    data: {
      patientId: patients[7].id, doctorId: doctors[4].staff.id,
      appointmentDate: daysAhead(3), startTime: daysAhead(3), endTime: new Date(daysAhead(3).getTime() + 60 * 60000),
      type: AppointmentType.EMERGENCY, status: AppointmentStatus.CONFIRMED,
      reason: 'Elective Caesarean Section — 39 weeks gestation, cephalopelvic disproportion',
    },
  });
  await prisma.surgeryCase.create({
    data: {
      patientId: patients[7].id, theaterId: theaters[1].id,
      leadSurgeonId: doctors[4].staff.id,
      scheduledStart: daysAhead(3),
      scheduledEnd: new Date(daysAhead(3).getTime() + 90 * 60000),
      status: 'SCHEDULED', notes: 'Pre-op: NBM from midnight. IV access. Consent signed.',
      priority: 'ELECTIVE',
    },
  });
  const inv8Total = 50000;
  await prisma.invoice.create({
    data: {
      invoiceNumber: nextInvoiceNumber(), patientId: patients[7].id,
      items: [
        { description: 'Caesarean Section Deposit', amount: 50000, quantity: 1, type: 'PROCEDURE' },
        { description: 'Specialist Consultation (O&G)', amount: 25000, quantity: 1, type: 'CONSULTATION' },
      ],
      subtotal: 75000, tax: 0, total: 75000,
      balance: 25000, amountPaid: 50000, status: InvoiceStatus.PARTIAL,
    },
  });

  // ─── NOTIFICATIONS ─────────────────────────────────────────────────────────
  console.log('🔔 Creating Notifications...');
  const notifData = [
    { userId: doctors[0].user.id, message: 'Funke Adesola has confirmed an appointment today at 9:00 AM' },
    { userId: doctors[3].user.id, message: 'Telemedicine session with Ngozi Eze scheduled for 10:00 AM' },
    { userId: pharmacistStaff.userId, message: 'Ceftriaxone 1g is below reorder level (50 units remaining)' },
    { userId: labTechStaff.userId, message: 'URGENT: Full Blood Count for Amara Nwosu — results required within 2 hours' },
    { userId: adminUser.id, message: 'Blessing Eze has submitted an annual leave request for approval' },
  ];
  for (const n of notifData) {
    await prisma.notification.create({
      data: { userId: n.userId, message: n.message, channel: NotificationChannel.IN_APP, priority: NotificationPriority.HIGH },
    });
  }

  // ─── AUDIT LOGS ────────────────────────────────────────────────────────────
  console.log('📋 Creating Audit Logs...');
  const auditLogs = [
    { userId: adminUser.id, action: 'CREATE', entity: 'Patient', entityId: patients[0].id, details: { action: 'Patient registered: Emeka Okafor (HMS-2025-0001)' } },
    { userId: pharmacistStaff.userId, action: 'DISPENSE', entity: 'Prescription', entityId: presc1.id, details: { action: 'Dispensed Artemether-Lumefantrine x24 to patient Emeka Okafor' } },
    { userId: labTechStaff.userId, action: 'UPDATE', entity: 'LabOrder', entityId: labOrder1.id, details: { action: 'Lab results uploaded for FBC — Amara Nwosu. Critical flag: Elevated WBC' } },
    { userId: doctors[1].user.id, action: 'CREATE', entity: 'SurgeryCase', details: { action: 'Emergency appendectomy scheduled for Amara Nwosu — Theater 1' } },
    { userId: adminUser.id, action: 'UPDATE', entity: 'Admission', entityId: admission2.id, details: { action: 'Patient Amara Nwosu admitted to General Female Ward, Bed G-101' } },
  ];
  for (const log of auditLogs) {
    await prisma.auditLog.create({
      data: {
        userId: log.userId, action: log.action,
        entityType: log.entity, entityId: log.entityId || 'unknown',
        changes: log.details,
      },
    });
  }

  // ─── SUMMARY ───────────────────────────────────────────────────────────────
  console.log('\n✅ OltraHMS Seed Completed Successfully!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🌐 Live URL: https://oltra-hms-frontend.vercel.app');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 LOGIN CREDENTIALS (password for all: OltraHMS1!)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Role              Email');
  console.log('Admin             admin@oltrahms.com');
  console.log('Doctor (Medicine) doctor@oltrahms.com');
  console.log('Doctor (Surgery)  doctor2@oltrahms.com');
  console.log('Doctor (Paeds)    doctor3@oltrahms.com');
  console.log('Doctor (Cardio)   doctor4@oltrahms.com');
  console.log('Doctor (O&G)      doctor5@oltrahms.com');
  console.log('Pharmacist        pharmacist@oltrahms.com');
  console.log('Lab Technician    labtech@oltrahms.com');
  console.log('Nurse             nurse@oltrahms.com');
  console.log('Receptionist      receptionist@oltrahms.com');
  console.log('Accountant        accountant@oltrahms.com');
  console.log('Radiologist       radiologist@oltrahms.com');
  console.log('Patient           patient@oltrahms.com');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Seeded Data Summary:');
  console.log('  • 8 patients with Nigerian names and Lagos addresses');
  console.log('  • 3 patients with insurance (1 active NHIS, 1 expired, 1 active HMO)');
  console.log('  • 5 doctors across specialties');
  console.log('  • 8 supporting staff roles');
  console.log('  • 10 medications with 2 FEFO batches each');
  console.log('  • 8 appointments (past, present, upcoming)');
  console.log('  • 2 video/telemedicine sessions (1 completed, 1 scheduled)');
  console.log('  • 2 surgery cases (1 completed, 1 scheduled C-section)');
  console.log('  • Lab orders with results + pending');
  console.log('  • Radiology requests with reports');
  console.log('  • Inpatient admission with ward rounds + fluid balance + MAR');
  console.log('  • 5 invoices (paid, partial, issued)');
  console.log('  • Payroll for all staff (Feb paid, March pending)');
  console.log('  • Insurance records (active, expired)');
  console.log('  • Wellness vitals tracking (7 days)');
  console.log('  • Audit logs + notifications');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch(console.error).finally(() => prisma.$disconnect());
