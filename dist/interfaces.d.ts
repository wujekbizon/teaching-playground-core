export interface Room {
    id: string;
    name: string;
    capacity: number;
    status: 'available' | 'occupied' | 'maintenance';
    features?: RoomFeatures;
    participants?: RoomParticipant[];
    createdAt: string;
    updatedAt: string;
}
export interface RoomParticipant {
    id: string;
    username: string;
    role: 'teacher' | 'student';
    joinedAt: string;
    isStreaming: boolean;
}
export interface RoomFeatures {
    hasVideo: boolean;
    hasAudio: boolean;
    hasChat: boolean;
    hasWhiteboard: boolean;
    hasScreenShare: boolean;
}
