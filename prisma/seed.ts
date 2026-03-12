import { PrismaClient, Role, Status, Gender, AppointmentStatus, AppointmentType, MedicationRoute, DosageForm, LabPriority, LabStatus, BedStatus, PaymentMethod, PaymentStatus, InvoiceStatus, InsuranceStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Comprehensive Seed...');

  // 1. Clean up existing data in reverse order of dependencies
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

  // 2. Common Data
  // Use environment variable for seed password, fallback to 'password123' for development
  const seedPassword = process.env.SEED_PASSWORD || 'password123';
  const passwordHash = await bcrypt.hash(seedPassword, 12);
  const hireDate = new Date('2022-01-15');

  // 3. Create Departments
  console.log('🏢 Creating Departments...');
  const departmentNames = ['General Medicine', 'Surgery', 'Pediatrics', 'Pharmacy', 'Laboratory', 'Radiology', 'Nursing', 'Finance', 'HR', 'Reception'];
  const deptMap = new Map<string, string>();
  for (const name of departmentNames) {
      const dept = await prisma.department.create({
          data: { name, description: `${name} Department` }
      });
      deptMap.set(name, dept.id);
  }

  // 4. Create Wards and Beds
  console.log('🏥 Creating Wards and Beds...');
  const wardsData = [
    { name: 'General Male Ward', type: 'GENERAL', capacity: 10, basePrice: 5000 },
    { name: 'General Female Ward', type: 'GENERAL', capacity: 10, basePrice: 5000 },
    { name: 'Pediatrics Ward', type: 'PEDIATRICS', capacity: 6, basePrice: 8000 },
    { name: 'Intensive Care Unit (ICU)', type: 'ICU', capacity: 4, basePrice: 45000 },
    { name: 'Maternity Ward', type: 'MATERNITY', capacity: 8, basePrice: 15000 }
  ];

  const wardMap = new Map<string, string>();
  for (const wData of wardsData) {
      const ward = await prisma.ward.create({
          data: {
              name: wData.name,
              type: wData.type,
              capacity: wData.capacity,
              basePrice: wData.basePrice
          }
      });
      wardMap.set(ward.name, ward.id);
      
      // Create Beds for this ward
      for (let i = 1; i <= wData.capacity; i++) {
        // Leave ICU beds a bit pricier
        const bedPrice = (wData.type === 'ICU') ? wData.basePrice + 5000 : null;
        await prisma.bed.create({
            data: {
                wardId: ward.id,
                number: `${wData.name.charAt(0).toUpperCase()}-${100 + i}`,
                type: wData.type,
                price: bedPrice,
                status: BedStatus.VACANT_CLEAN
            }
        });
      }
  }

  const allBeds = await prisma.bed.findMany();

  // 5. Create Leave Types
  console.log('🏖️ Creating Leave Types...');
  const leaveTypes = await Promise.all([
    prisma.leaveType.create({ data: { name: 'Annual Leave', defaultDays: 21, isPaid: true } }),
    prisma.leaveType.create({ data: { name: 'Sick Leave', defaultDays: 14, isPaid: true } }),
    prisma.leaveType.create({ data: { name: 'Maternity Leave', defaultDays: 90, isPaid: true } }),
    prisma.leaveType.create({ data: { name: 'Unpaid Leave', defaultDays: 30, isPaid: false } })
  ]);

  // 6. Create Users & Staff
  console.log('👩‍⚕️ Creating Users and Staff...');
  
  // ADMIN
  const admin = await prisma.user.create({
    data: {
      email: 'admin@oltrahms.com', firstName: 'Super', lastName: 'Admin', role: Role.ADMIN, status: Status.ACTIVE, passwordHash
    }
  });

  // DOCTORS
  const doctors = [];
  const doctorSpecs = [
    { first: 'Gregory', last: 'House', spec: 'Diagnostic Medicine', dept: 'General Medicine' },
    { first: 'Meredith', last: 'Grey', spec: 'General Surgery', dept: 'Surgery' },
    { first: 'Shaun', last: 'Murphy', spec: 'Pediatrics', dept: 'Pediatrics' },
    { first: 'Stephen', last: 'Strange', spec: 'Neurosurgeon', dept: 'Surgery' },
    { first: 'Miranda', last: 'Bailey', spec: 'General Surgery', dept: 'Surgery' },
  ];

  for (const [index, d] of doctorSpecs.entries()) {
    const user = await prisma.user.create({
       data: { email: `${d.first.toLowerCase()}@oltrahms.com`, firstName: d.first, lastName: d.last, role: Role.DOCTOR, status: Status.ACTIVE, passwordHash }
    });
    const staff = await prisma.staff.create({
        data: { userId: user.id, staffNumber: `DOC-${2025000 + index}`, specialization: d.spec, departmentId: deptMap.get(d.dept), hireDate, baseSalary: 850000 }
    });
    doctors.push({ user, staff });
    
    // Allocate leave balances
    for (const lt of leaveTypes) {
        await prisma.staffLeaveBalance.create({
            data: { staffId: staff.id, leaveTypeId: lt.id, allocatedDays: lt.defaultDays, usedDays: 0 }
        });
    }
  }

  // OTHER ROLES
  const otherStaffData = [
    { email: 'pharma@oltrahms.com', first: 'Walter', last: 'White', role: Role.PHARMACIST, dept: 'Pharmacy', spec: 'Pharmacology', num: 'PHM-001', sal: 450000 },
    { email: 'lab@oltrahms.com', first: 'Dexter', last: 'Morgan', role: Role.LAB_TECH, dept: 'Laboratory', spec: 'Pathology', num: 'LAB-001', sal: 400000 },
    { email: 'nurse@oltrahms.com', first: 'Carla', last: 'Espinosa', role: Role.NURSE, dept: 'Nursing', spec: 'General Nursing', num: 'NUR-001', sal: 350000 },
    { email: 'nurse2@oltrahms.com', first: 'Jackie', last: 'Peyton', role: Role.NURSE, dept: 'Nursing', spec: 'Emergency Nursing', num: 'NUR-002', sal: 370000 },
    { email: 'reception@oltrahms.com', first: 'Pam', last: 'Beesly', role: Role.RECEPTIONIST, dept: 'Reception', spec: 'Front Desk', num: 'REC-001', sal: 200000 },
    { email: 'accountant@oltrahms.com', first: 'Angela', last: 'Martin', role: Role.ACCOUNTANT, dept: 'Finance', spec: 'Accounting', num: 'FIN-001', sal: 500000 },
    { email: 'insurance@oltrahms.com', first: 'Oscar', last: 'Martinez', role: Role.INSURANCE_OFFICER, dept: 'Finance', spec: 'HMO Officer', num: 'FIN-002', sal: 450000 },
    { email: 'radio@oltrahms.com', first: 'Marie', last: 'Curie', role: Role.RADIOLOGIST, dept: 'Radiology', spec: 'Radiologist', num: 'RAD-001', sal: 750000 }
  ];

  const staffDetails = [];
  for (const s of otherStaffData) {
      const user = await prisma.user.create({
          data: { email: s.email, firstName: s.first, lastName: s.last, role: s.role, status: Status.ACTIVE, passwordHash }
      });
      const staff = await prisma.staff.create({
          data: { userId: user.id, staffNumber: s.num, specialization: s.spec, departmentId: deptMap.get(s.dept), hireDate, baseSalary: s.sal }
      });
      staffDetails.push({ user, staff, role: s.role });
      
      // Leave Balances
      for (const lt of leaveTypes) {
        await prisma.staffLeaveBalance.create({
            data: { staffId: staff.id, leaveTypeId: lt.id, allocatedDays: lt.defaultDays, usedDays: 0 }
        });
      }
  }

  const nurseStaff = staffDetails.find(s => s.user.email === 'nurse@oltrahms.com')?.staff;
  const pharmacistStaff = staffDetails.find(s => s.user.email === 'pharma@oltrahms.com')?.staff;
  const labTechStaff = staffDetails.find(s => s.user.email === 'lab@oltrahms.com')?.staff;
  const radiologistStaff = staffDetails.find(s => s.user.email === 'radio@oltrahms.com')?.staff;

  // 7. Create Services and Radiology Tests
  console.log('🩺 Creating Services & Pricing...');
  const servicesData = [
    { name: 'General Consultation', type: 'CONSULTATION', price: 15000 },
    { name: 'Specialist Consultation', type: 'CONSULTATION', price: 25000 },
    { name: 'Full Blood Count', type: 'LAB', price: 8000, code: 'LAB-FBC' },
    { name: 'Liver Function Test', type: 'LAB', price: 12000, code: 'LAB-LFT' },
    { name: 'Malaria Parasite', type: 'LAB', price: 3000, code: 'LAB-MP' },
    { name: 'Appendectomy', type: 'PROCEDURE', price: 250000, code: 'PROC-APP' },
    { name: 'Caesarean Section', type: 'PROCEDURE', price: 450000, code: 'PROC-CS' },
  ];
  
  for (const s of servicesData) {
      // @ts-ignore
      await prisma.service.create({ data: s });
  }

  const radiologyTests = [
      { name: 'Chest X-Ray', code: 'RAD-CXR', price: 10000, modality: 'XRAY' },
      { name: 'Brain MRI', code: 'RAD-MRI-B', price: 75000, modality: 'MRI' },
      { name: 'Abdominal Ultrasound', code: 'RAD-US-A', price: 15000, modality: 'ULTRASOUND' }
  ];
  const radTestMap = new Map();
  for (const rt of radiologyTests) {
      const res = await prisma.radiologyTest.create({ data: rt });
      radTestMap.set(rt.code, res.id);
  }

  // 8. Create Medications
  console.log('💊 Creating Medications...');
  const medicationsData = [
      { name: 'Paracetamol', dosageForm: DosageForm.TABLET, price: 500, reorderLevel: 200, category: 'Analgesic' },
      { name: 'Amoxicillin', dosageForm: DosageForm.CAPSULE, price: 1500, reorderLevel: 100, category: 'Antibiotic' },
      { name: 'Artemether-Lumefantrine', dosageForm: DosageForm.TABLET, price: 2500, reorderLevel: 100, category: 'Antimalarial' },
      { name: 'Ibuprofen', dosageForm: DosageForm.TABLET, price: 800, reorderLevel: 150, category: 'NSAID' },
      { name: 'Ceftriaxone', dosageForm: DosageForm.INJECTION, price: 3500, reorderLevel: 50, category: 'Antibiotic' },
  ];

  const medicationObjects = [];
  for (const med of medicationsData) {
      const createdMed = await prisma.medication.create({ data: med });
      medicationObjects.push(createdMed);
      await prisma.inventoryBatch.create({
          data: {
              medicationId: createdMed.id,
              batchNumber: `BATCH-${Math.floor(Math.random() * 10000)}`,
              quantity: 500,
              expiryDate: new Date('2028-01-01'),
              costPrice: createdMed.price * 0.7
          }
      });
  }

  // 9. Create Patients
  console.log('🤒 Creating Patients...');
  const patientData = [
    { first: 'John', last: 'Doe', gender: Gender.MALE, dob: '1990-05-15', bg: 'O_POSITIVE' },
    { first: 'Jane', last: 'Smith', gender: Gender.FEMALE, dob: '1985-08-22', bg: 'A_POSITIVE' },
    { first: 'Michael', last: 'Johnson', gender: Gender.MALE, dob: '2010-12-01', bg: 'B_NEGATIVE' },
    { first: 'Emily', last: 'Davis', gender: Gender.FEMALE, dob: '1995-03-10', bg: 'AB_POSITIVE' },
    { first: 'Robert', last: 'Wilson', gender: Gender.MALE, dob: '1970-11-25', bg: 'O_NEGATIVE' },
    { first: 'Sarah', last: 'Brown', gender: Gender.FEMALE, dob: '1988-07-14', bg: 'A_NEGATIVE' }
  ];

  const patients = [];
  for (const [index, p] of patientData.entries()) {
      const pUser = await prisma.user.create({
          data: { email: `patient${index+1}@oltrahms.com`, firstName: p.first, lastName: p.last, role: Role.PATIENT, passwordHash }
      });
      const patient = await prisma.patient.create({
          data: {
              userId: pUser.id,
              patientNumber: `HMS-2025-${(index+1).toString().padStart(4, '0')}`,
              firstName: p.first,
              lastName: p.last,
              dateOfBirth: new Date(p.dob),
              gender: p.gender,
              // @ts-ignore
              bloodGroup: p.bg,
              phone: `+234800000000${index}`,
              address: `${index+1} Main Street, Lagos`
          }
      });
      patients.push(patient);
  }

  // 10. Generate App Flows (Appointments, Medical Records, Invoices, Admissions)
  console.log('🔄 Generating Application Flows (Appointments, Records, Invoices, Admissions)...');
  
  // Flow A: Completed Appointment with Prescription and Invoice (Outpatient)
  const patient1 = patients[0];
  const doctor1 = doctors[0].staff;
  
  const appt1 = await prisma.appointment.create({
      data: {
          patientId: patient1.id, doctorId: doctor1.id,
          appointmentDate: new Date(), startTime: new Date(), endTime: new Date(Date.now() + 30*60*1000),
          type: AppointmentType.FIRST_VISIT, status: AppointmentStatus.COMPLETED,
          reason: 'Fever and headaches'
      }
  });

  const record1 = await prisma.medicalRecord.create({
      data: {
          patientId: patient1.id, doctorId: doctor1.id, appointmentId: appt1.id,
          subjective: { chiefComplaint: 'Fever for 3 days', historyOfPresentIllness: 'Associated with chills' },
          objective: { physicalExamination: 'Temperature 39C, mild pallor' },
          assessment: { primaryDiagnosis: 'Acute Malaria' },
          plan: { treatment: 'Antimalarial therapy' }
      }
  });

  const presc1 = await prisma.prescription.create({
      data: {
          medicalRecordId: record1.id, patientId: patient1.id,
          medicationName: medicationObjects[2].name, dosage: '1 tablet', frequency: 'Twice daily',
          route: MedicationRoute.ORAL, duration: 3, quantity: 6, status: 'DISPENSED'
      }
  });

  if (pharmacistStaff) {
      await prisma.dispensing.create({
          data: {
              prescriptionId: presc1.id, medicationId: medicationObjects[2].id,
              batchNumber: 'BATCH-1234', quantity: 6, dispensedById: pharmacistStaff.id
          }
      });
  }

  await prisma.invoice.create({
      data: {
          invoiceNumber: `INV-2025-0001`, patientId: patient1.id, medicalRecordId: record1.id,
          items: [
              { description: 'General Consultation', amount: 15000, quantity: 1, type: 'CONSULTATION' },
              { description: medicationObjects[2].name, amount: medicationObjects[2].price * 6, quantity: 6, type: 'PHARMACY' }
          ],
          subtotal: 15000 + (medicationObjects[2].price * 6), tax: 0, total: 15000 + (medicationObjects[2].price * 6),
          balance: 0, amountPaid: 15000 + (medicationObjects[2].price * 6), 
          status: InvoiceStatus.PAID
      }
  });

  // Flow B: Inpatient Admission, Lab Orders, Ward Management
  const patient2 = patients[1];
  const doctor2 = doctors[1].staff;
  const targetBed = allBeds.find(b => b.type === 'GENERAL')!;

  // Allocate bed
  await prisma.bed.update({ where: { id: targetBed.id }, data: { status: BedStatus.OCCUPIED } });

  const admission = await prisma.admission.create({
      data: {
          patientId: patient2.id, bedId: targetBed.id, admittedById: admin.id,
          reason: 'Severe Appendicitis requiring surgery',
          status: 'ADMITTED'
      }
  });

  if (nurseStaff) {
      await prisma.wardRound.create({
          data: {
              admissionId: admission.id, conductedById: nurseStaff.id,
              notes: 'Patient resting, pain reduced after analgesics. Vitals stable.'
          }
      });
  }

  const record2 = await prisma.medicalRecord.create({
      data: {
          patientId: patient2.id, doctorId: doctor2.id,
          subjective: { chiefComplaint: 'Right lower quadrant pain' },
          objective: { physicalExamination: 'Guarding and rebound tenderness present' },
          assessment: { primaryDiagnosis: 'Acute Appendicitis' },
          plan: { treatment: 'Surgery (Appendectomy)' }
      }
  });

  const labOrder1 = await prisma.labOrder.create({
      data: {
          medicalRecordId: record2.id, patientId: patient2.id,
          testName: 'Full Blood Count', testCode: 'LAB-FBC', priority: LabPriority.URGENT,
          status: LabStatus.COMPLETED, orderedAt: new Date(Date.now() - 24*60*60*1000), completedAt: new Date()
      }
  });

  if (labTechStaff) {
      await prisma.labResult.create({
          data: {
              labOrderId: labOrder1.id, uploadedById: labTechStaff.id,
              resultData: { wbc: '15.2', hb: '13.5', plt: '250' },
              criticalFlags: ['High WBC']
          }
      });
  }

  // Invoice for Outpatient/Inpatient pending
  await prisma.invoice.create({
      data: {
          invoiceNumber: `INV-2025-0002`, patientId: patient2.id,
          items: [
              { description: 'Specialist Consultation', amount: 25000, quantity: 1, type: 'CONSULTATION' },
              { description: 'Full Blood Count', amount: 8000, quantity: 1, type: 'LAB' },
              { description: 'Bed Deposit', amount: 50000, quantity: 1, type: 'ADMISSION' }
          ],
          subtotal: 83000, tax: 0, total: 83000,
          balance: 33000, amountPaid: 50000, 
          status: InvoiceStatus.PARTIAL
      }
  });

  // Flow C: Radiology Request
  if (radiologistStaff) {
      const radReq = await prisma.radiologyRequest.create({
          data: {
              patientId: patients[2].id, doctorId: doctors[0].staff.id, testId: radTestMap.get('RAD-CXR'),
              status: 'COMPLETED', priority: 'ROUTINE', notes: 'Persistent cough'
          }
      });
      await prisma.radiologyReport.create({
          data: {
              requestId: radReq.id, radiologistId: radiologistStaff.id,
              findings: 'Clear lung fields. No consolidation.', impression: 'Normal Chest X-Ray',
              imageUrls: []
          }
      });
  }

  // 11. Create Sample Leave Request for HR Flows
  console.log('✈️ Creating Leave Requests...');
  await prisma.leaveRequest.create({
      data: {
          staffId: nurseStaff!.id, leaveTypeId: leaveTypes[0].id,
          startDate: new Date('2026-03-01'), endDate: new Date('2026-03-10'),
          days: 10, reason: 'Family Vacation', status: 'PENDING'
      }
  });

  console.log('✅ Seed Completed Successfully!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
