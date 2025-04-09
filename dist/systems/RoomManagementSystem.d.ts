import { Room, User } from '../interfaces';
import { System, TeachingPlayground } from '../TeachingPlayground';
export declare class RoomManagementSystem implements System {
    private _playground;
    private _db;
    constructor();
    setPlayground(playground: TeachingPlayground): void;
    createRoom(room: Room): Promise<{
        status: string;
        participants: never[];
        createdAt: string;
        updatedAt: string;
        id: string;
        name: string;
        capacity: number;
        features?: import("../interfaces").RoomFeatures;
    }>;
    updateRoom(roomId: string, updates: Partial<Room>): Promise<any>;
    deleteRoom(roomId: string): Promise<boolean>;
    getRooms(): Promise<any>;
    getRoom(roomId: string): Promise<any>;
    addParticipant(roomId: string, user: User, role?: 'teacher' | 'student'): Promise<any>;
    removeParticipant(roomId: string, userId: string): Promise<any>;
    updateParticipantStatus(roomId: string, userId: string, isStreaming: boolean): Promise<any>;
    getAllParticipantsInRoom(roomId: string): Promise<any>;
}
