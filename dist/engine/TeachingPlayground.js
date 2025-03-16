"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const RealTimeCommunicationSystem_1 = require("../systems/comms/RealTimeCommunicationSystem");
const DataManagementSystem_1 = require("../systems/data/DataManagementSystem");
const EventManagementSystem_1 = require("../systems/event/EventManagementSystem");
const RoomManagementSystem_1 = require("../systems/room/RoomManagementSystem");
const interfaces_1 = require("../interfaces");
class TeachingPlayground {
    constructor(config) {
        this.currentUser = null;
        this.roomSystem = new RoomManagementSystem_1.RoomManagementSystem(config.roomConfig);
        this.commsSystem = new RealTimeCommunicationSystem_1.RealTimeCommunicationSystem(config.commsConfig);
        this.eventSystem = new EventManagementSystem_1.EventManagementSystem(config.eventConfig);
        this.dataSystem = new DataManagementSystem_1.DataManagementSystem(config.dataConfig);
        console.log('Teaching Playground initialized with all systems.');
    }
    // Room Management
    async createClassroom(options) {
        const room = await this.roomSystem.createRoom(options);
        this.commsSystem.setupForRoom(room.id);
        return room;
    }
    // User Management
    setCurrentUser(user) {
        this.currentUser = user;
    }
    ensureUserAuthorized(requiredRole) {
        if (!this.currentUser) {
            throw new interfaces_1.SystemError('UNAUTHORIZED', 'No user logged in');
        }
        if (this.currentUser.role !== requiredRole && this.currentUser.role !== 'admin') {
            throw new interfaces_1.SystemError('FORBIDDEN', `Only ${requiredRole}s can perform this action`);
        }
    }
    // Enhanced Event Management
    async scheduleLecture(options) {
        try {
            this.ensureUserAuthorized('teacher');
            // Create the event with teacher information
            const event = await this.eventSystem.createEvent({
                ...options,
                teacherId: this.currentUser.id,
                createdBy: this.currentUser.name,
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
            throw new interfaces_1.SystemError('LECTURE_SCHEDULING_FAILED', 'Failed to schedule lecture', error);
        }
    }
    async getTeacherLectures(options) {
        try {
            this.ensureUserAuthorized('teacher');
            return await this.eventSystem.listEvents({
                type: 'lecture',
                teacherId: this.currentUser.id,
                ...options,
            });
        }
        catch (error) {
            throw new interfaces_1.SystemError('LECTURE_LIST_FAILED', 'Failed to fetch teacher lectures', error);
        }
    }
    async updateLecture(lectureId, updates) {
        try {
            this.ensureUserAuthorized('teacher');
            // Verify lecture ownership
            const lecture = await this.eventSystem.getEvent(lectureId);
            if (lecture.teacherId !== this.currentUser.id) {
                throw new interfaces_1.SystemError('FORBIDDEN', 'You can only update your own lectures');
            }
            return await this.eventSystem.updateEvent(lectureId, updates);
        }
        catch (error) {
            throw new interfaces_1.SystemError('LECTURE_UPDATE_FAILED', 'Failed to update lecture', error);
        }
    }
    async cancelLecture(lectureId, reason) {
        try {
            this.ensureUserAuthorized('teacher');
            // Verify lecture ownership
            const lecture = await this.eventSystem.getEvent(lectureId);
            if (lecture.teacherId !== this.currentUser.id) {
                throw new interfaces_1.SystemError('FORBIDDEN', 'You can only cancel your own lectures');
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
            throw new interfaces_1.SystemError('LECTURE_CANCELLATION_FAILED', 'Failed to cancel lecture', error);
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
            throw new interfaces_1.SystemError('LECTURE_LIST_FAILED', 'Failed to fetch lectures');
        }
    }
    async getLectureDetails(lectureId) {
        try {
            const lecture = await this.eventSystem.getEvent(lectureId);
            const commsStatus = await this.commsSystem.getResourceStatus(lectureId);
            const participants = [...(await this.roomSystem.getRoomParticipants(lecture.roomId))];
            return {
                ...lecture,
                communicationStatus: commsStatus,
                participants,
            };
        }
        catch (error) {
            console.error('Failed to get lecture details:', error);
            throw new interfaces_1.SystemError('LECTURE_DETAILS_FAILED', 'Failed to fetch lecture details');
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
exports.default = TeachingPlayground;
