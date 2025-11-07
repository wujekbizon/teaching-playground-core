import { CommsConfig } from '../../interfaces';
import { Server as HttpServer } from 'http';
import { EventEmitter } from 'events';
export declare class RealTimeCommunicationSystem extends EventEmitter {
    private config?;
    private io;
    private rooms;
    private streams;
    private messages;
    private roomLastActivity;
    private cleanupInterval;
    private messageLimiter;
    private messageSequence;
    private readonly INACTIVE_THRESHOLD;
    private readonly CLEANUP_INTERVAL;
    private readonly MESSAGE_HISTORY_LIMIT;
    private readonly RATE_LIMIT_MESSAGES;
    private readonly RATE_LIMIT_WINDOW;
    constructor(config?: CommsConfig | undefined);
    initialize(server: HttpServer): void;
    private startAutomaticCleanup;
    private cleanupInactiveRooms;
    private updateRoomActivity;
    private setupEventHandlers;
    private handleJoinRoom;
    private handleRequestMessageHistory;
    private handleLeaveRoom;
    private checkRateLimit;
    private handleMessage;
    private handleStartStream;
    private handleStopStream;
    private handleWebRTCOffer;
    private handleWebRTCAnswer;
    private handleWebRTCIceCandidate;
    private handleDisconnect;
    setupForRoom(roomId: string): void;
    allocateResources(eventId: string): void;
    deallocateResources(eventId: string): Promise<void>;
    getResourceStatus(eventId: string): Promise<{
        websocket: boolean;
        webrtc: boolean;
        participants: number;
        resources: {
            allocated: boolean;
            type: string;
        };
    }>;
    shutdown(): Promise<void>;
}
