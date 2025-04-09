import { SystemError } from '../../interfaces';
import { JsonDatabase } from '../../utils/JsonDatabase';
import { RealTimeCommunicationSystem } from '../comms/RealTimeCommunicationSystem';
export class RoomManagementSystem {
    constructor(config) {
        this.config = config;
        // Use singleton instance of JsonDatabase
        this.db = JsonDatabase.getInstance();
        this.commsSystem = new RealTimeCommunicationSystem();
        console.log('RoomManagementSystem initialized with singleton database instance');
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
            console.log(`Adding participant ${user.username} (${user.id}) to room ${roomId}`);
            const room = await this.getRoom(roomId);
            // Check if user is already in the room
            const existingParticipant = room.participants.find(p => p.id === user.id);
            if (existingParticipant) {
                console.log(`User ${user.username} is already in room ${roomId}`);
                return existingParticipant;
            }
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
            // Create a new array with all existing participants plus the new one
            const updatedParticipants = [...room.participants, participant];
            // Update the room in the database with the new participants array
            const updatedRoom = await this.db.update('rooms', { id: roomId }, {
                participants: updatedParticipants,
                updatedAt: new Date().toISOString()
            });
            if (!updatedRoom) {
                throw new SystemError('PARTICIPANT_ADD_FAILED', 'Failed to update room with new participant');
            }
            console.log(`Successfully added ${user.username} to room ${roomId}. Total participants: ${updatedParticipants.length}`);
            console.log(`Participants in room: ${updatedParticipants.map(p => p.username).join(', ')}`);
            return participant;
        }
        catch (error) {
            console.error(`Failed to add participant ${user.username} to room ${roomId}:`, error);
            throw new SystemError('PARTICIPANT_ADD_FAILED', 'Failed to add participant', error);
        }
    }
    async removeParticipant(roomId, userId) {
        try {
            console.log(`Removing participant ${userId} from room ${roomId}`);
            const room = await this.getRoom(roomId);
            // Check if user is in the room
            const participantIndex = room.participants.findIndex(p => p.id === userId);
            if (participantIndex === -1) {
                console.log(`User ${userId} is not in room ${roomId}, nothing to remove`);
                return;
            }
            const username = room.participants[participantIndex].username;
            // Create a new array without the participant to remove
            const updatedParticipants = room.participants.filter(p => p.id !== userId);
            // Save updated participants list
            const updatedRoom = await this.db.update('rooms', { id: roomId }, {
                participants: updatedParticipants,
                updatedAt: new Date().toISOString()
            });
            if (!updatedRoom) {
                throw new SystemError('PARTICIPANT_REMOVE_FAILED', 'Failed to update room after removing participant');
            }
            console.log(`Successfully removed ${username} (${userId}) from room ${roomId}. Remaining participants: ${updatedParticipants.length}`);
            console.log(`Participants in room: ${updatedParticipants.map(p => p.username).join(', ')}`);
        }
        catch (error) {
            console.error(`Failed to remove participant ${userId} from room ${roomId}:`, error);
            throw new SystemError('PARTICIPANT_REMOVE_FAILED', 'Failed to remove participant', error);
        }
    }
    async updateParticipantStreamingStatus(roomId, userId, isStreaming) {
        try {
            console.log(`Updating streaming status for ${userId} in room ${roomId}: ${isStreaming ? 'streaming' : 'not streaming'}`);
            const room = await this.getRoom(roomId);
            // Create a new array with updated participant streaming status
            const updatedParticipants = room.participants.map(p => {
                if (p.id === userId) {
                    return { ...p, isStreaming: isStreaming };
                }
                return p;
            });
            // Save updated participants list
            const updatedRoom = await this.db.update('rooms', { id: roomId }, {
                participants: updatedParticipants,
                updatedAt: new Date().toISOString()
            });
            if (!updatedRoom) {
                throw new SystemError('PARTICIPANT_UPDATE_FAILED', 'Failed to update participant streaming status');
            }
            console.log(`Successfully updated streaming status for ${userId} in room ${roomId}`);
            return updatedRoom;
        }
        catch (error) {
            console.error(`Failed to update streaming status for ${userId} in room ${roomId}:`, error);
            throw new SystemError('PARTICIPANT_UPDATE_FAILED', 'Failed to update participant streaming status', error);
        }
    }
    async clearParticipants(roomId) {
        try {
            console.log(`Clearing all participants from room ${roomId}`);
            // Save updated participants list
            const updatedRoom = await this.db.update('rooms', { id: roomId }, {
                participants: [],
                updatedAt: new Date().toISOString()
            });
            if (!updatedRoom) {
                throw new SystemError('PARTICIPANTS_CLEAR_FAILED', 'Failed to clear participants from room');
            }
            console.log(`Successfully cleared all participants from room ${roomId}`);
        }
        catch (error) {
            console.error(`Failed to clear participants from room ${roomId}:`, error);
            throw new SystemError('PARTICIPANTS_CLEAR_FAILED', 'Failed to clear participants', error);
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
