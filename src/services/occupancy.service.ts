import { BedStatus } from '@prisma/client';

export interface WardWithBeds {
    id: string;
    name: string;
    type: string;
    capacity: number;
    beds: Array<{ status: BedStatus }>;
}

export const buildOccupancySummary = (wards: WardWithBeds[]) => {
    const wardSummaries = wards.map((ward) => {
        const totalBeds = ward.beds.length;
        const occupiedBeds = ward.beds.filter((bed) => bed.status === BedStatus.OCCUPIED).length;
        const availableBeds = ward.beds.filter((bed) => bed.status === BedStatus.VACANT_CLEAN).length;
        const cleaningBeds = ward.beds.filter((bed) => bed.status === BedStatus.VACANT_DIRTY).length;
        const maintenanceBeds = ward.beds.filter((bed) => bed.status === BedStatus.MAINTENANCE).length;

        return {
            id: ward.id,
            name: ward.name,
            type: ward.type,
            configuredCapacity: ward.capacity,
            totalBeds,
            occupiedBeds,
            availableBeds,
            cleaningBeds,
            maintenanceBeds,
            occupancyRate: totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
        };
    });

    const totalBeds = wardSummaries.reduce((sum, ward) => sum + ward.totalBeds, 0);
    const occupiedBeds = wardSummaries.reduce((sum, ward) => sum + ward.occupiedBeds, 0);
    const availableBeds = wardSummaries.reduce((sum, ward) => sum + ward.availableBeds, 0);
    const cleaningBeds = wardSummaries.reduce((sum, ward) => sum + ward.cleaningBeds, 0);
    const maintenanceBeds = wardSummaries.reduce((sum, ward) => sum + ward.maintenanceBeds, 0);

    return {
        totalBeds,
        occupiedBeds,
        availableBeds,
        cleaningBeds,
        maintenanceBeds,
        occupancyRate: totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0,
        wards: wardSummaries,
        updatedAt: new Date().toISOString(),
    };
};
