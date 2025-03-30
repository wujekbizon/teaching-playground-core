import { RealTimeCommunicationSystem } from '../systems/comms/RealTimeCommunicationSystem';
import { DataManagementSystem } from '../systems/data/DataManagementSystem';
import { EventManagementSystem } from '../systems/event/EventManagementSystem';
import { RoomManagementSystem } from '../systems/room/RoomManagementSystem';
import { SystemError } from '../interfaces';
export default class TeachingPlayground {
    constructor(config) {
        this.currentUser = null;
        this.roomSystem = new RoomManagementSystem(config.roomConfig);
        this.commsSystem = new RealTimeCommunicationSystem(config.commsConfig);
        this.eventSystem = new EventManagementSystem(config.eventConfig);
        this.dataSystem = new DataManagementSystem(config.dataConfig);
        // Create a test room for development
        if (process.env.NODE_ENV === 'development') {
            this.roomSystem.createTestRoom()
                .then(room => {
                console.log('Test room created:', room.id);
            })
                .catch(error => {
                console.error('Failed to create test room:', error);
            });
        }
        console.log('Teaching Playground initialized with all systems.');
    }
    // Room Management
    async createClassroom(options) {
        const room = await this.roomSystem.createRoom({
            name: options.name,
            capacity: options.capacity,
            features: options.features || {
                hasVideo: true,
                hasAudio: true,
                hasChat: true,
                hasWhiteboard: false,
                hasScreenShare: true,
            },
        });
        this.commsSystem.setupForRoom(room.id);
        return room;
    }
    // User Management
    setCurrentUser(user) {
        this.currentUser = user;
    }
    async ensureUserAuthorized(user, action) {
        if (!user) {
            throw new SystemError('UNAUTHORIZED', 'No user provided');
        }
        if (user.role !== 'teacher' && user.role !== 'admin') {
            throw new SystemError('UNAUTHORIZED', `User ${user.username} is not authorized to ${action}. Required role: teacher or admin`);
        }
    }
    // Enhanced Event Management
    async scheduleLecture(options) {
        try {
            this.ensureUserAuthorized(this.currentUser, 'schedule a lecture');
            // Create the event with teacher information
            const event = await this.eventSystem.createEvent({
                ...options,
                teacherId: this.currentUser.id,
                createdBy: this.currentUser.username,
            });
            // Setup communication resources
            await this.commsSystem.allocateResources(event.id);
            // Save additional event metadata
            await this.dataSystem.saveData(`event_meta_${event.id}`, {
                createdAt: new Date().toISOString(),
                createdBy: this.currentUser.id,
                lastModified: new Date().toISOString(),
            });
            return event;
        }
        catch (error) {
            throw new SystemError('LECTURE_SCHEDULING_FAILED', 'Failed to schedule lecture', error);
        }
    }
    async getTeacherLectures(options) {
        try {
            this.ensureUserAuthorized(this.currentUser, 'fetch teacher lectures');
            return await this.eventSystem.listEvents({
                type: 'lecture',
                teacherId: this.currentUser.id,
                ...options,
            });
        }
        catch (error) {
            throw new SystemError('LECTURE_LIST_FAILED', 'Failed to fetch teacher lectures', error);
        }
    }
    async updateLecture(lectureId, updates) {
        try {
            this.ensureUserAuthorized(this.currentUser, 'update a lecture');
            // Verify lecture ownership
            const lecture = await this.eventSystem.getEvent(lectureId);
            if (lecture.teacherId !== this.currentUser.id) {
                throw new SystemError('FORBIDDEN', 'You can only update your own lectures');
            }
            return await this.eventSystem.updateEvent(lectureId, updates);
        }
        catch (error) {
            throw new SystemError('LECTURE_UPDATE_FAILED', 'Failed to update lecture', error);
        }
    }
    async cancelLecture(lectureId, reason) {
        try {
            this.ensureUserAuthorized(this.currentUser, 'cancel a lecture');
            // Verify lecture ownership
            const lecture = await this.eventSystem.getEvent(lectureId);
            if (lecture.teacherId !== this.currentUser.id) {
                throw new SystemError('FORBIDDEN', 'You can only cancel your own lectures');
            }
            await this.eventSystem.cancelEvent(lectureId);
            await this.commsSystem.deallocateResources(lectureId);
            await this.dataSystem.saveData(`event_cancellation_${lectureId}`, {
                cancelledAt: new Date().toISOString(),
                cancelledBy: this.currentUser.id,
                reason,
            });
        }
        catch (error) {
            throw new SystemError('LECTURE_CANCELLATION_FAILED', 'Failed to cancel lecture', error);
        }
    }
    async listLectures(roomId) {
        try {
            const lectures = await this.eventSystem.listEvents({
                type: 'lecture',
                ...(roomId !== undefined && { roomId }),
            });
            // Enrich with communication status
            return await Promise.all(lectures.map(async (lecture) => ({
                ...lecture,
                communicationStatus: await this.commsSystem.getResourceStatus(lecture.id),
            })));
        }
        catch (error) {
            console.error('Failed to list lectures:', error);
            throw new SystemError('LECTURE_LIST_FAILED', 'Failed to fetch lectures');
        }
    }
    async getLectureDetails(lectureId) {
        try {
            const lecture = await this.eventSystem.getEvent(lectureId);
            const commsStatus = await this.commsSystem.getResourceStatus(lectureId);
            const participants = (await this.roomSystem.getRoomParticipants(lecture.roomId))
                .map(p => ({
                id: p.id,
                role: p.role === 'admin' ? 'teacher' : p.role,
                status: p.status === 'away' ? 'offline' : p.status
            }));
            return {
                ...lecture,
                communicationStatus: commsStatus,
                participants,
            };
        }
        catch (error) {
            console.error('Failed to get lecture details:', error);
            throw new SystemError('LECTURE_DETAILS_FAILED', 'Failed to fetch lecture details');
        }
    }
    // Communication
    setupCommunication(roomId) {
        console.log(`Setting up communication for room: ${roomId}`);
    }
    disconnectCommunication(roomId) {
        console.log(`Disconnecting communication for room: ${roomId}`);
    }
    // Data Handling
    async saveState() {
        console.log('Saving state');
    }
    async loadState() {
        console.log('Loading state');
    }
    // System Health
    getSystemStatus() {
        return {
            roomSystem: 'healthy',
            commsSystem: 'healthy',
            eventSystem: 'healthy',
            dataSystem: 'healthy',
        };
    }
    restartSystem(system) {
        console.log(`Restarting system: ${system}`);
    }
    // Lifecycle
    shutdown() {
        console.log('Shutting down all systems');
    }
    initialize(config) {
        console.log('Reinitializing with new config');
    }
}
