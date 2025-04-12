import { User } from './user.interface';
import { Lecture } from './event.interface';
export interface RoomConfig {
    maxParticipants?: number;
    [key: string]: any;
}
export interface RoomOptions {
    name: string;
    [key: string]: any;
}
export interface RoomFeatures {
    hasVideo: boolean;
    hasAudio: boolean;
    hasChat: boolean;
    hasWhiteboard: boolean;
    hasScreenShare: boolean;
}
export interface RoomState {
    isStreamActive: boolean;
    isChatActive: boolean;
    activeFeatures: string[];
    participantCount: number;
    communicationStatus?: {
        websocket: boolean;
        webrtc: boolean;
        resources: {
            allocated: boolean;
            type: string;
        };
    };
}
export interface RoomParticipant extends User {
    joinedAt: string;
    canStream: boolean;
    canChat: boolean;
    canScreenShare: boolean;
    username: string;
    isStreaming?: boolean;
}
export interface Room {
    id: string;
    name: string;
    capacity: number;
    status: 'available' | 'occupied' | 'scheduled' | 'maintenance';
    features: RoomFeatures;
    participants: RoomParticipant[];
    currentLecture?: {
        id: string;
        name: string;
        teacherId: string;
        status: Lecture['status'];
    } | null;
    createdAt: string;
    updatedAt: string;
}
export interface CreateRoomOptions {
    name: string;
    capacity: number;
    features?: Partial<RoomFeatures>;
}
