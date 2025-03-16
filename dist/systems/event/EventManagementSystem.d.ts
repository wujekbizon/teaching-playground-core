import { EventConfig, Lecture, EventOptions } from '../../interfaces';
export declare class EventManagementSystem {
    private config?;
    private db;
    constructor(config?: EventConfig | undefined);
    createEvent(options: EventOptions & {
        teacherId: string;
        createdBy: string;
    }): Promise<Lecture>;
    cancelEvent(eventId: string): Promise<void>;
    getEvent(eventId: string): Promise<Lecture>;
    listEvents(filter: {
        type: string;
        roomId?: string;
        teacherId?: string;
        status?: string;
    }): Promise<Lecture[]>;
    updateEvent(eventId: string, updates: Partial<Lecture>): Promise<Lecture>;
    updateEventStatus(eventId: string, newStatus: Lecture['status']): Promise<Lecture>;
}
