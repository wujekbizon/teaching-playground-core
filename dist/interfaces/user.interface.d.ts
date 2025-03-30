export interface User {
    id: string;
    username: string;
    role: 'teacher' | 'student' | 'admin';
    email?: string;
    displayName?: string;
    status: 'online' | 'offline' | 'away';
    metadata?: {
        lastActive: string;
        preferences: {
            theme: 'light' | 'dark';
            notifications: boolean;
            language: string;
        };
    };
}
export interface TeacherProfile extends User {
    role: 'teacher';
    subjects: string[];
    availability: {
        days: ('monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday')[];
        hours: {
            start: string;
            end: string;
        };
    };
    rating?: number;
    totalLectures?: number;
    completedLectures?: number;
}
