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
    private roomId;
    private user;
    private serverUrl;
    private socket;
    private webrtc;
    private isConnected;
    private connectedPeers;
    private messageHistory;
    private currentStream;
    private reconnectAttempts;
    private maxReconnectAttempts;
    private reconnectDelay;
    private shouldReconnect;
    private rooms;
    private streams;
    private messages;
    constructor(roomId: string, user: User, serverUrl: string);
    private setupWebRTCEvents;
    connect(): void;
    private setupSocketListeners;
    private handleReconnect;
    private joinRoom;
    disconnect(): void;
    startStream(stream: MediaStream, quality?: StreamState['quality']): Promise<boolean>;
    stopStream(): void;
    sendMessage(content: string): void;
    getMessageHistory(): RoomMessage[];
    getCurrentStream(): StreamState | null;
    getConnectionStatus(): boolean;
    private handleOffer;
    private handleAnswer;
    private handleIceCandidate;
}
export {};
