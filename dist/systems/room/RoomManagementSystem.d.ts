import { RoomConfig } from '../../interfaces';
export declare class RoomManagementSystem {
    private config?;
    constructor(config?: RoomConfig | undefined);
    createRoom(options: {
        name: string;
        [key: string]: any;
    }): Promise<{
        name: string;
        id: string;
    }>;
    getRoomParticipants(roomId: string): Promise<readonly [{
        readonly id: "user1";
        readonly role: "teacher";
        readonly status: "online";
    }, {
        readonly id: "user2";
        readonly role: "student";
        readonly status: "online";
    }]>;
}
