import { RoomConfig } from '../../interfaces';
import { Room, CreateRoomOptions, RoomState, RoomParticipant } from '../../interfaces/room.interface';
import { User } from '../../interfaces/user.interface';
import { Lecture } from '../../interfaces/event.interface';
export declare class RoomManagementSystem {
    private config?;
    private db;
    private commsSystem;
    constructor(config?: RoomConfig | undefined);
    createRoom(options: CreateRoomOptions): Promise<Room>;
    assignLectureToRoom(roomId: string, lecture: Lecture): Promise<Room>;
    startLecture(roomId: string): Promise<Room>;
    endLecture(roomId: string): Promise<Room>;
    getRoom(roomId: string): Promise<Room>;
    listRooms(filter?: {
        status?: Room['status'];
    }): Promise<Room[]>;
    updateRoom(roomId: string, updates: Partial<Room>): Promise<Room>;
    getRoomParticipants(roomId: string): Promise<RoomParticipant[]>;
    addParticipant(roomId: string, user: User): Promise<RoomParticipant>;
    removeParticipant(roomId: string, userId: string): Promise<void>;
    updateParticipantStreamingStatus(roomId: string, userId: string, isStreaming: boolean): Promise<Room>;
    clearParticipants(roomId: string): Promise<void>;
    getRoomState(roomId: string): Promise<RoomState>;
    createTestRoom(): Promise<Room>;
    getAvailableRooms(): Promise<Room[]>;
}
