import { CommsConfig } from '../../interfaces';
import { Server as HttpServer } from 'http';
import { EventEmitter } from 'events';
export declare class RealTimeCommunicationSystem extends EventEmitter {
    private config?;
    private io;
    private rooms;
    private streams;
    private messages;
    constructor(config?: CommsConfig | undefined);
    initialize(server: HttpServer): void;
    private setupEventHandlers;
    private handleJoinRoom;
    private handleLeaveRoom;
    private handleMessage;
    private handleStartStream;
    private handleStopStream;
    private handleDisconnect;
    setupForRoom(roomId: string): void;
    allocateResources(eventId: string): void;
    deallocateResources(eventId: string): Promise<void>;
    getResourceStatus(eventId: string): Promise<{
        websocket: boolean;
        webrtc: boolean;
        resources: {
            allocated: boolean;
            type: string;
        };
    }>;
}
