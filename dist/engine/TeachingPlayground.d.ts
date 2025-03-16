import { TeachingPlaygroundConfig } from '../interfaces/teaching-playground.interface';
import { Lecture } from '../interfaces/event.interface';
import { User } from '../interfaces/user.interface';
export default class TeachingPlayground {
    private roomSystem;
    private commsSystem;
    private eventSystem;
    private dataSystem;
    private currentUser;
    constructor(config: TeachingPlaygroundConfig);
    createClassroom(options: {
        name: string;
        [key: string]: any;
    }): Promise<{
        name: string;
        id: string;
    }>;
    setCurrentUser(user: User): void;
    private ensureUserAuthorized;
    scheduleLecture(options: {
        name: string;
        date: string;
        roomId: string;
        description?: string;
        maxParticipants?: number;
    }): Promise<Lecture>;
    getTeacherLectures(options?: {
        status?: 'scheduled' | 'in-progress' | 'completed' | 'cancelled';
        fromDate?: string;
        toDate?: string;
    }): Promise<Lecture[]>;
    updateLecture(lectureId: string, updates: {
        name?: string;
        date?: string;
        description?: string;
        maxParticipants?: number;
    }): Promise<Lecture>;
    cancelLecture(lectureId: string, reason?: string): Promise<void>;
    listLectures(roomId?: string): Promise<Lecture[]>;
    getLectureDetails(lectureId: string): Promise<Lecture>;
    setupCommunication(roomId: string): void;
    disconnectCommunication(roomId: string): void;
    saveState(): Promise<void>;
    loadState(): Promise<void>;
    getSystemStatus(): {
        [key: string]: string;
    };
    restartSystem(system: 'room' | 'comms' | 'event' | 'data'): void;
    shutdown(): void;
    initialize(config: TeachingPlaygroundConfig): void;
}
