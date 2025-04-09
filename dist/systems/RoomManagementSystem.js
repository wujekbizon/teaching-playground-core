import { SystemError } from '../interfaces';
import { JsonDatabase } from '../utils/JsonDatabase';
export class RoomManagementSystem {
    constructor() {
        this._playground = null;
        this._db = JsonDatabase.getInstance();
        console.log('RoomManagementSystem initialized with singleton database instance');
    }
    setPlayground(playground) {
        this._playground = playground;
    }
    async createRoom(room) {
        const existingRoom = await this._db.findOne('rooms', { id: room.id });
        if (existingRoom) {
            throw new SystemError('ROOM_ALREADY_EXISTS', `Room with id ${room.id} already exists`);
        }
        const newRoom = {
            ...room,
            status: 'available',
            participants: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        await this._db.insert('rooms', newRoom);
        console.log(`Room created: ${newRoom.id} - ${newRoom.name}`);
        return newRoom;
    }
    async updateRoom(roomId, updates) {
        const room = await this._db.findOne('rooms', { id: roomId });
        if (!room) {
            throw new SystemError('ROOM_NOT_FOUND', `Room with id ${roomId} not found`);
        }
        const updatedRoom = await this._db.update('rooms', { id: roomId }, updates);
        console.log(`Room updated: ${roomId}`, updates);
        return updatedRoom;
    }
    async deleteRoom(roomId) {
        const room = await this._db.findOne('rooms', { id: roomId });
        if (!room) {
            throw new SystemError('ROOM_NOT_FOUND', `Room with id ${roomId} not found`);
        }
        const result = await this._db.delete('rooms', { id: roomId });
        console.log(`Room deleted: ${roomId}`);
        return result;
    }
    async getRooms() {
        return await this._db.find('rooms');
    }
    async getRoom(roomId) {
        const room = await this._db.findOne('rooms', { id: roomId });
        if (!room) {
            throw new SystemError('ROOM_NOT_FOUND', `Room with id ${roomId} not found`);
        }
        return room;
    }
    async addParticipant(roomId, user, role = 'student') {
        console.log(`Adding participant to room ${roomId}: ${user.username} (${user.id}) as ${role}`);
        const room = await this._db.findOne('rooms', { id: roomId });
        if (!room) {
            throw new SystemError('ROOM_NOT_FOUND', `Room with id ${roomId} not found`);
        }
        // Check if user is already in the room
        const participants = room.participants || [];
        const existingParticipant = participants.find((p) => p.id === user.id);
        if (existingParticipant) {
            console.log(`User ${user.username} (${user.id}) is already in room ${roomId}`);
            return room;
        }
        // Create new participant object
        const participant = {
            id: user.id,
            username: user.username,
            role: role,
            joinedAt: new Date().toISOString(),
            isStreaming: false
        };
        // Add to participants array
        const updatedParticipants = [...participants, participant];
        // Update the room in the database
        const updatedRoom = await this._db.update('rooms', { id: roomId }, {
            participants: updatedParticipants,
            updatedAt: new Date().toISOString()
        });
        console.log(`Participant added to room ${roomId}: ${user.username} (${user.id}) as ${role}`);
        console.log(`Room now has ${updatedRoom.participants.length} participants`);
        return updatedRoom;
    }
    async removeParticipant(roomId, userId) {
        console.log(`Removing participant from room ${roomId}: ${userId}`);
        const room = await this._db.findOne('rooms', { id: roomId });
        if (!room) {
            throw new SystemError('ROOM_NOT_FOUND', `Room with id ${roomId} not found`);
        }
        // Remove user from participants
        const participants = room.participants || [];
        const updatedParticipants = participants.filter((p) => p.id !== userId);
        // Check if user was actually in the room
        if (participants.length === updatedParticipants.length) {
            console.log(`User ${userId} was not in room ${roomId}`);
            return room;
        }
        // Update the room in the database
        const updatedRoom = await this._db.update('rooms', { id: roomId }, {
            participants: updatedParticipants,
            updatedAt: new Date().toISOString()
        });
        console.log(`Participant removed from room ${roomId}: ${userId}`);
        console.log(`Room now has ${updatedRoom.participants.length} participants`);
        return updatedRoom;
    }
    async updateParticipantStatus(roomId, userId, isStreaming) {
        const room = await this._db.findOne('rooms', { id: roomId });
        if (!room) {
            throw new SystemError('ROOM_NOT_FOUND', `Room with id ${roomId} not found`);
        }
        // Find and update the participant
        const participants = room.participants || [];
        const updatedParticipants = participants.map((p) => {
            if (p.id === userId) {
                return { ...p, isStreaming };
            }
            return p;
        });
        // Update the room in the database
        const updatedRoom = await this._db.update('rooms', { id: roomId }, {
            participants: updatedParticipants,
            updatedAt: new Date().toISOString()
        });
        console.log(`Updated streaming status for ${userId} in room ${roomId}: ${isStreaming ? 'streaming' : 'not streaming'}`);
        return updatedRoom;
    }
    async getAllParticipantsInRoom(roomId) {
        const room = await this._db.findOne('rooms', { id: roomId });
        if (!room) {
            throw new SystemError('ROOM_NOT_FOUND', `Room with id ${roomId} not found`);
        }
        return room.participants || [];
    }
}
