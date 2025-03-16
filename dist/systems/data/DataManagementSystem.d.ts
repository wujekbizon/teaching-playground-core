import { DataConfig } from '../../interfaces';
export declare class DataManagementSystem {
    private config?;
    constructor(config?: DataConfig | undefined);
    saveData(key: string, value: any): Promise<void>;
    fetchData(key: string): Promise<any>;
    deleteEventData(eventId: string): Promise<void>;
    backupData(): Promise<void>;
    restoreData(backupId: string): Promise<void>;
    getDataStats(): Promise<{
        totalEvents: number;
        totalRooms: number;
        lastBackup: string | null;
    }>;
}
