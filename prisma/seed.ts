import { PrismaClient, Role, Status, Gender, AppointmentStatus, AppointmentType, MedicationRoute, DosageForm, LabPriority, LabStatus, BedStatus, PaymentMethod, PaymentStatus, InvoiceStatus, InsuranceStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Seed...');

  // 1. Clean up existing data
  console.log('🧹 Cleaning up database...');
  // Delete in order to respect foreign keys
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.videoSession.deleteMany();
  await prisma.labResult.deleteMany();
  await prisma.labOrder.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.dispensing.deleteMany();
  await prisma.prescription.deleteMany();
  await prisma.inventoryBatch.deleteMany();
  await prisma.medication.deleteMany();
  await prisma.admission.deleteMany();
  await prisma.bed.deleteMany();
  await prisma.ward.deleteMany();
  await prisma.medicalRecord.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.patientInsurance.deleteMany();
  await prisma.vitalSigns.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.staff.deleteMany();
  await prisma.user.deleteMany();

  // 2. Common Data
  const passwordHash = await bcrypt.hash('OltraHMS@123', 12);
  const hireDate = new Date();

  // 3. Create Users & Staff

  // ADMIN
  const admin = await prisma.user.create({
    data: {
      email: 'admin@oltrahms.com',
      firstName: 'Super',
      lastName: 'Admin',
      role: Role.ADMIN,
      status: Status.ACTIVE,
      passwordHash,
    }
  });
  console.log('✅ Created Admin:', admin.email);

  // DOCTORS
  const doctors = [];
  const doctorSpecs = [
    { first: 'Gregory', last: 'House', spec: 'Diagnostic Medicine' },
    { first: 'Meredith', last: 'Grey', spec: 'General Surgery' },
    { first: 'Shaun', last: 'Murphy', spec: 'Surgical Resident' },
    { first: 'Stephen', last: 'Strange', spec: 'Neurosurgeon' },
  ];

  for (const [index, d] of doctorSpecs.entries()) {
    const user = await prisma.user.create({
       data: {
           email: `${d.first.toLowerCase()}@oltrahms.com`,
           firstName: d.first,
           lastName: d.last,
           role: Role.DOCTOR,
           status: Status.ACTIVE,
           passwordHash
       }
    });

    const staff = await prisma.staff.create({
        data: {
            userId: user.id,
            staffNumber: `DOC-${2025000 + index}`,
            specialization: d.spec,
            departmentId: 'General',
            hireDate,
        }
    });
    doctors.push(staff);
    console.log(`✅ Created Doctor: ${d.first} ${d.last}`);
  }

  // PHARMACIST
  const pharmaUser = await prisma.user.create({
      data: {
          email: 'pharma@oltrahms.com',
          firstName: 'Walter',
          lastName: 'White',
          role: Role.PHARMACIST,
          status: Status.ACTIVE,
          passwordHash
      }
  });
  const pharmacist = await prisma.staff.create({
      data: {
          userId: pharmaUser.id,
          staffNumber: 'PHARM-001',
          specialization: 'Pharmacology',
          departmentId: 'Pharmacy',
          hireDate
      }
  });
  console.log('✅ Created Pharmacist: Walter White');

  // LAB TECH
  const labUser = await prisma.user.create({
      data: {
          email: 'lab@oltrahms.com',
          firstName: 'Dexter',
          lastName: 'Morgan',
          role: Role.LAB_TECH,
          status: Status.ACTIVE,
          passwordHash
      }
  });
  const labTech = await prisma.staff.create({
      data: {
          userId: labUser.id,
          staffNumber: 'LAB-001',
          specialization: 'Pathology',
          departmentId: 'Laboratory',
          hireDate
      }
  });
  console.log('✅ Created Lab Tech: Dexter Morgan');

  // RECEPTIONIST
  const receptUser = await prisma.user.create({
      data: {
          email: 'reception@oltrahms.com',
          firstName: 'Pam',
          lastName: 'Beesly',
          role: Role.RECEPTIONIST,
          status: Status.ACTIVE,
          passwordHash
      }
  });
  const receptionist = await prisma.staff.create({
      data: {
          userId: receptUser.id,
          staffNumber: 'REC-001',
          specialization: 'Front Desk',
          departmentId: 'Reception',
          hireDate
      }
  });
  console.log('✅ Created Receptionist: Pam Beesly');

  // NURSE
  const nurseUser = await prisma.user.create({
      data: {
          email: 'nurse@oltrahms.com',
          firstName: 'Carla',
          lastName: 'Espinosa',
          role: Role.NURSE,
          status: Status.ACTIVE,
          passwordHash
      }
  });
  const nurse = await prisma.staff.create({
      data: {
          userId: nurseUser.id,
          staffNumber: 'NUR-001',
          specialization: 'General Nursing',
          departmentId: 'Nursing',
          hireDate
      }
  });
  console.log('✅ Created Nurse: Carla Espinosa');


  // 4. Create Patients
  const patientSpecs = [
      { first: 'John', last: 'Doe', phone: '1234567890', dob: '1985-06-15', gender: Gender.MALE },
      { first: 'Jane', last: 'Smith', phone: '0987654321', dob: '1992-11-20', gender: Gender.FEMALE },
      { first: 'Michael', last: 'Scott', phone: '1122334455', dob: '1975-03-30', gender: Gender.MALE },
  ];

  const patients = [];

  for (const [index, p] of patientSpecs.entries()) {
      const user = await prisma.user.create({
          data: {
              email: `${p.first.toLowerCase()}@example.com`,
              firstName: p.first,
              lastName: p.last,
              role: Role.PATIENT,
              status: Status.ACTIVE,
              passwordHash
          }
      });

      const patient = await prisma.patient.create({
          data: {
              userId: user.id,
              patientNumber: `HMS-2025-${String(index + 1).padStart(6, '0')}`,
              firstName: p.first,
              lastName: p.last,
              dateOfBirth: new Date(p.dob),
              gender: p.gender,
              phone: p.phone,
              address: '123 Main St, Springfield',
              emergencyContact: { name: 'Emergency Contact', phone: '999-999-9999', relationship: 'Spouse' }
          }
      });
      patients.push(patient);
      console.log(`✅ Created Patient: ${p.first} ${p.last}`);
  }


  // 5. Workflow Data

  // --- Appointments ---
  // Past appointment
  const pastAppt = await prisma.appointment.create({
      data: {
          patientId: patients[0].id,
          doctorId: doctors[0].id,
          startTime: new Date(new Date().setHours(9, 0, 0, 0) - 86400000), // Yesterday 9 AM
          endTime: new Date(new Date().setHours(9, 30, 0, 0) - 86400000),
          type: AppointmentType.FIRST_VISIT,
          status: AppointmentStatus.COMPLETED,
          appointmentDate: new Date(new Date().setDate(new Date().getDate() - 1))
      }
  });

  // Future Appointments (Today)
  const today = new Date();
  today.setHours(10, 0, 0, 0);
  
  const futureAppt = await prisma.appointment.create({
      data: {
          patientId: patients[1].id,
          doctorId: doctors[1].id,
          startTime: today,
          endTime: new Date(today.getTime() + 30 * 60000),
          type: AppointmentType.FOLLOW_UP,
          appointmentDate: today,
          status: AppointmentStatus.CONFIRMED
      }
  });
  console.log('✅ Created Appointments');

  // --- Medical Record & Prescriptions (Pharmacy Flow) ---
  
  // Create Medications
  const meds = [
      { name: 'Paracetamol', form: DosageForm.TABLET, price: 50, stock: 1000 },
      { name: 'Amoxicillin', form: DosageForm.CAPSULE, price: 150, stock: 500 },
      { name: 'Ibuprofen', form: DosageForm.TABLET, price: 80, stock: 800 },
  ];

  const medicationRecords = [];
  for (const m of meds) {
      const med = await prisma.medication.create({
          data: {
              name: m.name,
              dosageForm: m.form,
              price: m.price,
              reorderLevel: 100
          }
      });
      // Add Inventory
      await prisma.inventoryBatch.create({
          data: {
              medicationId: med.id,
              batchNumber: `BAT-${Math.floor(Math.random() * 10000)}`,
              quantity: m.stock,
              expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 2)),
              costPrice: m.price * 0.6
          }
      });
      medicationRecords.push(med);
  }
  console.log('✅ Created Medications & Inventory');

  // Create Medical Record for Past Appointment
  const medicalRecord = await prisma.medicalRecord.create({
      data: {
          patientId: patients[0].id,
          doctorId: doctors[0].id,
          appointmentId: pastAppt.id,
          visitDate: pastAppt.appointmentDate,
          subjective: { chiefComplaint: "Headache and fever" },
          objective: { temp: 38.5, bp: "120/80" },
          assessment: { diagnosis: "Viral Fever" },
          plan: { treatment: "Rest and hydration" }
      }
  });

  // Create Prescription linked to record
  await prisma.prescription.create({
      data: {
          medicalRecordId: medicalRecord.id,
          patientId: patients[0].id,
          medicationName: medicationRecords[0].name, // Paracetamol
          dosage: "500mg",
          frequency: "TD",
          route: MedicationRoute.ORAL,
          duration: 3,
          quantity: 9,
          status: 'PENDING',
          instructions: "Take after food"
      }
  });
  console.log('✅ Created Medical Record & Prescription');

  // --- Lab Flow ---
  // Create Lab Order
  await prisma.labOrder.create({
      data: {
          patientId: patients[1].id,
          medicalRecordId: medicalRecord.id, // Re-using record for simplicity, ideally should match patient
          testName: "Full Blood Count",
          status: LabStatus.PENDING,
          priority: LabPriority.ROUTINE,
          clinicalIndication: "Check for infection"
      }
  });
  console.log('✅ Created Lab Order');

  // --- Inpatient Flow ---
  // Create Wards & Beds
  const maleWard = await prisma.ward.create({
      data: {
          name: "Male General Ward",
          type: "GENERAL",
          capacity: 5
      }
  });

  for (let i = 1; i <= 5; i++) {
      await prisma.bed.create({
          data: {
              wardId: maleWard.id,
              number: `M-${100 + i}`,
              status: i === 1 ? BedStatus.OCCUPIED : BedStatus.VACANT_CLEAN
          }
      });
  }

  // Admit Michael Scott
  const occupiedBed = await prisma.bed.findFirst({ where: { status: BedStatus.OCCUPIED } });
  if (occupiedBed) {
      await prisma.admission.create({
          data: {
              patientId: patients[2].id, // Michael Scott
              bedId: occupiedBed.id,
              admittedById: doctors[1].userId, // Meredith Grey
              reason: "Appendicitis recovery",
              status: "ADMITTED",
              admissionDate: new Date()
          }
      });
      console.log('✅ Created Inpatient Admission');
  }

  // --- Invoices ---
  await prisma.invoice.create({
      data: {
          invoiceNumber: 'INV-001',
          patientId: patients[0].id,
          subtotal: 50,
          tax: 0,
          total: 50,
          balance: 50,
          status: InvoiceStatus.ISSUED,
          items: [{ description: "Consultation", amount: 50, quantity: 1 }]
      }
  });
  console.log('✅ Created Invoice');

  console.log('🚀 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
