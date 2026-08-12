import { prisma } from '../lib/prisma';

export interface QueueEvent {
    type: 'PATIENT_CHECKED_IN' | 'PATIENT_CALLED' | 'PATIENT_WITH_DOCTOR' | 'PATIENT_COMPLETED' | 'PATIENT_TRIAGED' | 'QUEUE_UPDATED' | 'PATIENT_ADDED' | 'PATIENT_REMOVED';
    appointmentId: string;
    patientId: string;
    patientName: string;
    tokenNumber: number;
    doctorId?: string;
    doctorName?: string;
    department?: string;
    status?: string;
    timestamp: Date;
}

// Get queue IO instance
function getQueueIO() {
    return (global as any).queueIO;
}

// Emit event to specific room
export function emitToRoom(room: string, event: string, data: any) {
    const io = getQueueIO();
    if (io) {
        io.to(room).emit(event, data);
    }
}

// Emit event to all queue listeners
export function emitQueueEvent(event: QueueEvent) {
    const io = getQueueIO();
    if (io) {
        io.to('reception').emit('queue-event', event);
        io.to('display').emit('queue-event', event);
        io.to('nurse-station').emit('queue-event', event);
        
        if (event.doctorId) {
            io.to(`doctor-${event.doctorId}`).emit('queue-event', event);
        }

        if (event.department) {
            io.to(`department-${event.department}`).emit('queue-event', event);
        }
    }
}

// Notify reception of new patient
export async function notifyPatientCheckedIn(appointmentId: string) {
    const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
            patient: { select: { firstName: true, lastName: true } },
            doctor: { include: { user: { select: { firstName: true, lastName: true } }, department: true } }
        }
    });
    
    if (appointment) {
        const event: QueueEvent = {
            type: 'PATIENT_CHECKED_IN',
            appointmentId: appointment.id,
            patientId: appointment.patientId,
            patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
            tokenNumber: appointment.queuePosition || 0,
            doctorId: appointment.doctorId,
            doctorName: appointment.doctor ? `${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}` : undefined,
            department: appointment.doctor?.department?.name,
            status: appointment.status,
            timestamp: new Date()
        };
        emitQueueEvent(event);
    }
}

// Notify that patient was called
export async function notifyPatientCalled(appointmentId: string) {
    const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
            patient: { select: { firstName: true, lastName: true } },
            doctor: { include: { user: { select: { firstName: true, lastName: true } }, department: true } }
        }
    });
    
    if (appointment) {
        const event: QueueEvent = {
            type: 'PATIENT_CALLED',
            appointmentId: appointment.id,
            patientId: appointment.patientId,
            patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
            tokenNumber: appointment.queuePosition || 0,
            doctorId: appointment.doctorId,
            doctorName: appointment.doctor ? `${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}` : undefined,
            department: appointment.doctor?.department?.name,
            status: appointment.status,
            timestamp: new Date()
        };
        emitQueueEvent(event);
    }
}

// Notify that patient is with doctor
export async function notifyPatientWithDoctor(appointmentId: string) {
    const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
            patient: { select: { firstName: true, lastName: true } },
            doctor: { include: { user: { select: { firstName: true, lastName: true } }, department: true } }
        }
    });
    
    if (appointment) {
        const event: QueueEvent = {
            type: 'PATIENT_WITH_DOCTOR',
            appointmentId: appointment.id,
            patientId: appointment.patientId,
            patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
            tokenNumber: appointment.queuePosition || 0,
            doctorId: appointment.doctorId,
            doctorName: appointment.doctor ? `${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}` : undefined,
            department: appointment.doctor?.department?.name,
            status: appointment.status,
            timestamp: new Date()
        };
        emitQueueEvent(event);
    }
}

// Notify that patient consultation completed
export async function notifyPatientCompleted(appointmentId: string) {
    const appointment = await prisma.appointment.findUnique({
        where: { id: appointmentId },
        include: {
            patient: { select: { firstName: true, lastName: true } },
            doctor: { include: { user: { select: { firstName: true, lastName: true } }, department: true } }
        }
    });
    
    if (appointment) {
        const event: QueueEvent = {
            type: 'PATIENT_COMPLETED',
            appointmentId: appointment.id,
            patientId: appointment.patientId,
            patientName: `${appointment.patient.firstName} ${appointment.patient.lastName}`,
            tokenNumber: appointment.queuePosition || 0,
            doctorId: appointment.doctorId,
            doctorName: appointment.doctor ? `${appointment.doctor.user.firstName} ${appointment.doctor.user.lastName}` : undefined,
            department: appointment.doctor?.department?.name,
            status: appointment.status,
            timestamp: new Date()
        };
        emitQueueEvent(event);
    }
}

// Notify queue update
export async function notifyQueueUpdate(doctorId?: string) {
    const event: QueueEvent = {
        type: 'QUEUE_UPDATED',
        appointmentId: '',
        patientId: '',
        patientName: '',
        tokenNumber: 0,
        doctorId,
        timestamp: new Date()
    };
    emitQueueEvent(event);
}

export default {
    emitQueueEvent,
    emitToRoom,
    notifyPatientCheckedIn,
    notifyPatientCalled,
    notifyPatientWithDoctor,
    notifyPatientCompleted,
    notifyQueueUpdate
};
