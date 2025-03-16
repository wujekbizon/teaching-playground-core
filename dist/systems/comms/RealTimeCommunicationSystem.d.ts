import { CommsConfig } from '../../interfaces';
export declare class RealTimeCommunicationSystem {
    private config?;
    constructor(config?: CommsConfig | undefined);
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
