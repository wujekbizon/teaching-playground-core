import { EventEmitter } from 'events';
import { User } from '../interfaces/user.interface';
interface RoomMessage {
    userId: string;
    username: string;
    content: string;
    timestamp: string;
}
interface StreamState {
    isActive: boolean;
    streamerId: string | null;
    quality: 'low' | 'medium' | 'high';
}
export declare class RoomConnection extends EventEmitter {
    private socket;
    private roomId;
    private user;
    private connected;
    private messageHistory;
    private currentStream;
    constructor(roomId: string, user: User, serverUrl: string);
    private setupSocketListeners;
    private joinRoom;
    connect(): void;
    disconnect(): void;
    sendMessage(content: string): boolean;
    startStream(quality?: StreamState['quality']): boolean;
    stopStream(): boolean;
    getMessageHistory(): RoomMessage[];
    getCurrentStream(): StreamState | null;
    isConnected(): boolean;
}
export {};
