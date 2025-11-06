import { CommsConfig } from '../../interfaces';
import { Server as HttpServer } from 'http';
import { EventEmitter } from 'events';
export declare class RealTimeCommunicationSystem extends EventEmitter {
    private config?;
    private io;
    private rooms;
    private streams;
    private messages;
    private roomMetadata;
    private readonly MAX_ROOMS;
    private readonly ROOM_TTL_MS;
    private readonly CLEANUP_INTERVAL_MS;
    private readonly MAX_MESSAGES_PER_ROOM;
    private cleanupIntervalId;
    constructor(config?: CommsConfig | undefined);
    initialize(server: HttpServer): void;
    private setupEventHandlers;
    private handleJoinRoom;
    private handleLeaveRoom;
    private handleMessage;
    private handleStartStream;
    private handleStopStream;
    private handleDisconnect;
    private handleWebRTCOffer;
    private handleWebRTCAnswer;
    private handleWebRTCIceCandidate;
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
    /**
     * Update room activity timestamp and participant count
     */
    private updateRoomActivity;
    /**
     * Start periodic cleanup task to remove stale rooms
     */
    private startCleanupTask;
    /**
     * Clean up rooms that are stale (no participants and past TTL)
     */
    private cleanupStaleRooms;
    /**
     * Clean up all data associated with a room
     */
    private cleanupRoom;
    /**
     * Stop cleanup task and clean up resources
     */
    shutdown(): void;
    /**
     * Get memory usage statistics
     */
    getMemoryStats(): {
        roomCount: number;
        totalParticipants: number;
        activeStreams: number;
        totalMessages: number;
        oldestRoom: number;
        memoryLimits: {
            maxRooms: number;
            roomTTL: number;
            maxMessagesPerRoom: number;
        };
    };
    /**
     * Get age of oldest room in milliseconds
     */
    private getOldestRoomAge;
}
