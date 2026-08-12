import { describe, expect, it } from 'vitest';
import { BedStatus } from '@prisma/client';
import { buildOccupancySummary } from './occupancy.service';

describe('hospital occupancy summary', () => {
    it('uses live bed states and handles empty wards', () => {
        const result = buildOccupancySummary([
            {
                id: 'ward-1', name: 'General', type: 'GENERAL', capacity: 5,
                beds: [
                    { status: BedStatus.OCCUPIED },
                    { status: BedStatus.OCCUPIED },
                    { status: BedStatus.VACANT_CLEAN },
                    { status: BedStatus.VACANT_DIRTY },
                ],
            },
            { id: 'ward-2', name: 'New Ward', type: 'GENERAL', capacity: 10, beds: [] },
        ]);

        expect(result).toMatchObject({ totalBeds: 4, occupiedBeds: 2, availableBeds: 1, cleaningBeds: 1, occupancyRate: 50 });
        expect(result.wards[1].occupancyRate).toBe(0);
    });
});
