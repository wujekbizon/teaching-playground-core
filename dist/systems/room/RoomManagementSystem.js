import { SystemError } from '../../interfaces';
import { JsonDatabase } from '../../utils/JsonDatabase';
import { RealTimeCommunicationSystem } from '../comms/RealTimeCommunicationSystem';
export class RoomManagementSystem {
    constructor(config) {
        this.config = config;
        this.db = new JsonDatabase();
        this.commsSystem = new RealTimeCommunicationSystem();
    }
    async createRoom(options) {
        try {
            const room = {
                id: `room_${Date.now()}`,
                name: options.name,
                capacity: options.capacity,
                status: 'available',
                features: {
                    hasVideo: options.features?.hasVideo ?? true,
                    hasAudio: options.features?.hasAudio ?? true,
                    hasChat: options.features?.hasChat ?? true,
                    hasWhiteboard: options.features?.hasWhiteboard ?? false,
                    hasScreenShare: options.features?.hasScreenShare ?? true,
                },
                participants: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            };
            await this.db.insert('rooms', room);
            // Setup communication for the new room
            this.commsSystem.setupForRoom(room.id);
            return room;
        }
        catch (error) {
            throw new SystemError('ROOM_CREATION_FAILED', 'Failed to create room', error);
        }
    }
    async assignLectureToRoom(roomId, lecture) {
        try {
            const room = await this.getRoom(roomId);
            // Update room with lecture and change status
            const updatedRoom = await this.updateRoom(roomId, {
                currentLecture: {
                    id: lecture.id,
                    name: lecture.name,
                    teacherId: lecture.teacherId,
                    status: lecture.status
                },
                status: 'scheduled'
            });
            // Allocate communication resources for the lecture
            this.commsSystem.allocateResources(lecture.id);
            return updatedRoom;
        }
        catch (error) {
            throw new SystemError('LECTURE_ASSIGNMENT_FAILED', 'Failed to assign lecture to room', error);
        }
    }
    async startLecture(roomId) {
        try {
            const room = await this.getRoom(roomId);
            if (!room.currentLecture) {
                throw new SystemError('NO_LECTURE_SCHEDULED', 'No lecture scheduled for this room');
            }
            // Update room and lecture status
            const updatedRoom = await this.updateRoom(roomId, {
                status: 'occupied',
                currentLecture: {
                    ...room.currentLecture,
                    status: 'in-progress'
                }
            });
            return updatedRoom;
        }
        catch (error) {
            throw new SystemError('LECTURE_START_FAILED', 'Failed to start lecture', error);
        }
    }
    async endLecture(roomId) {
        try {
            const room = await this.getRoom(roomId);
            if (!room.currentLecture) {
                throw new SystemError('NO_LECTURE_ACTIVE', 'No active lecture in this room');
            }
            // Deallocate communication resources
            await this.commsSystem.deallocateResources(room.currentLecture.id);
            // Clear the current lecture and reset room status
            const updatedRoom = await this.updateRoom(roomId, {
                status: 'available',
                currentLecture: undefined,
                participants: [] // Clear participants when lecture ends
            });
            return updatedRoom;
        }
        catch (error) {
            throw new SystemError('LECTURE_END_FAILED', 'Failed to end lecture', error);
        }
    }
    async getRoom(roomId) {
        try {
            const room = await this.db.findOne('rooms', { id: roomId });
            if (!room) {
                throw new SystemError('ROOM_NOT_FOUND', `Room ${roomId} not found`);
            }
            return room;
        }
        catch (error) {
            throw new SystemError('ROOM_FETCH_FAILED', 'Failed to fetch room', error);
        }
    }
    async listRooms(filter) {
        try {
            return await this.db.find('rooms', filter || {});
        }
        catch (error) {
            throw new SystemError('ROOM_LIST_FAILED', 'Failed to list rooms', error);
        }
    }
    async updateRoom(roomId, updates) {
        try {
            const room = await this.getRoom(roomId);
            const updatedRoom = {
                ...room,
                ...updates,
                updatedAt: new Date().toISOString(),
            };
            await this.db.update('rooms', { id: roomId }, updatedRoom);
            return updatedRoom;
        }
        catch (error) {
            throw new SystemError('ROOM_UPDATE_FAILED', 'Failed to update room', error);
        }
    }
    async getRoomParticipants(roomId) {
        try {
            const room = await this.getRoom(roomId);
            return room.participants;
        }
        catch (error) {
            throw new SystemError('PARTICIPANTS_FETCH_FAILED', 'Failed to fetch participants', error);
        }
    }
    async addParticipant(roomId, user) {
        try {
            const room = await this.getRoom(roomId);
            if (room.participants.length >= room.capacity) {
                throw new SystemError('ROOM_FULL', 'Room has reached maximum capacity');
            }
            const participant = {
                ...user,
                joinedAt: new Date().toISOString(),
                canStream: user.role === 'teacher',
                canChat: true,
                canScreenShare: user.role === 'teacher',
            };
            room.participants.push(participant);
            await this.updateRoom(roomId, { participants: room.participants });
            return participant;
        }
        catch (error) {
            throw new SystemError('PARTICIPANT_ADD_FAILED', 'Failed to add participant', error);
        }
    }
    async removeParticipant(roomId, userId) {
        try {
            const room = await this.getRoom(roomId);
            room.participants = room.participants.filter(p => p.id !== userId);
            await this.updateRoom(roomId, { participants: room.participants });
        }
        catch (error) {
            throw new SystemError('PARTICIPANT_REMOVE_FAILED', 'Failed to remove participant', error);
        }
    }
    async getRoomState(roomId) {
        try {
            const room = await this.getRoom(roomId);
            const commsStatus = room.currentLecture ?
                await this.commsSystem.getResourceStatus(room.currentLecture.id) :
                null;
            return {
                isStreamActive: room.status === 'occupied',
                isChatActive: room.features.hasChat && room.status === 'occupied',
                activeFeatures: Object.entries(room.features)
                    .filter(([_, enabled]) => enabled)
                    .map(([feature]) => feature),
                participantCount: room.participants.length,
                communicationStatus: commsStatus || undefined
            };
        }
        catch (error) {
            throw new SystemError('ROOM_STATE_FETCH_FAILED', 'Failed to fetch room state', error);
        }
    }
    async createTestRoom() {
        const room = {
            id: 'test-room-1',
            name: 'Test Room',
            capacity: 20,
            status: 'available',
            features: {
                hasVideo: true,
                hasAudio: true,
                hasChat: true,
                hasWhiteboard: true,
                hasScreenShare: true,
            },
            participants: [
                {
                    id: 'test-teacher',
                    username: 'Dr. Smith',
                    role: 'teacher',
                    status: 'online',
                    joinedAt: new Date().toISOString(),
                    canStream: true,
                    canChat: true,
                    canScreenShare: true,
                },
                {
                    id: 'test-student-1',
                    username: 'John Doe',
                    role: 'student',
                    status: 'online',
                    joinedAt: new Date().toISOString(),
                    canStream: false,
                    canChat: true,
                    canScreenShare: false,
                },
            ],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        await this.db.insert('rooms', room);
        return room;
    }
    // Method to get available rooms for new lectures
    async getAvailableRooms() {
        try {
            return await this.db.find('rooms', { status: 'available' });
        }
        catch (error) {
            throw new SystemError('ROOM_FETCH_FAILED', 'Failed to fetch available rooms', error);
        }
    }
}
