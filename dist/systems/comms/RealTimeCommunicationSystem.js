import { SystemError } from '../../interfaces';
import { Server as SocketIOServer } from 'socket.io';
import { EventEmitter } from 'events';
export class RealTimeCommunicationSystem extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.io = null;
        this.rooms = new Map(); // roomId -> Set of connected socketIds
        this.streams = new Map(); // roomId -> stream state
        this.messages = new Map(); // roomId -> messages
        this.roomMetadata = new Map(); // roomId -> metadata
        // Configuration for memory management
        this.MAX_ROOMS = 1000;
        this.ROOM_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
        this.CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
        this.MAX_MESSAGES_PER_ROOM = 100;
        this.cleanupIntervalId = null;
    }
    initialize(server) {
        this.io = new SocketIOServer(server, {
            cors: {
                origin: this.config?.allowedOrigins || "*",
                methods: ["GET", "POST"]
            },
            pingTimeout: 10000,
            pingInterval: 5000
        });
        this.setupEventHandlers();
        this.startCleanupTask();
        console.log('RealTimeCommunicationSystem initialized with memory cleanup');
    }
    setupEventHandlers() {
        if (!this.io)
            throw new SystemError('COMMS_NOT_INITIALIZED', 'Communication system not initialized');
        this.io.on('connection', (socket) => {
            console.log(`Client connected: ${socket.id}`);
            // Room events
            socket.on('join_room', (roomId, userId) => {
                this.handleJoinRoom(socket, roomId, userId);
            });
            socket.on('leave_room', (roomId) => {
                this.handleLeaveRoom(socket, roomId);
            });
            // Chat events
            socket.on('send_message', (roomId, message) => {
                this.handleMessage(socket, roomId, message);
            });
            // Stream events
            socket.on('start_stream', (roomId, userId, quality) => {
                this.handleStartStream(socket, roomId, userId, quality);
            });
            socket.on('stop_stream', (roomId) => {
                this.handleStopStream(socket, roomId);
            });
            // WebRTC signaling events
            socket.on('webrtc_offer', (data) => {
                this.handleWebRTCOffer(socket, data);
            });
            socket.on('webrtc_answer', (data) => {
                this.handleWebRTCAnswer(socket, data);
            });
            socket.on('webrtc_ice_candidate', (data) => {
                this.handleWebRTCIceCandidate(socket, data);
            });
            socket.on('disconnect', () => {
                this.handleDisconnect(socket);
            });
        });
    }
    handleJoinRoom(socket, roomId, userId) {
        try {
            socket.join(roomId);
            if (!this.rooms.has(roomId)) {
                this.rooms.set(roomId, new Set());
                // Initialize room metadata
                this.roomMetadata.set(roomId, {
                    createdAt: new Date(),
                    lastActivity: new Date(),
                    participantCount: 0
                });
            }
            this.rooms.get(roomId).add(socket.id);
            // Update room metadata
            this.updateRoomActivity(roomId);
            // Send room state to the joining user
            socket.emit('room_state', {
                stream: this.streams.get(roomId) || { isActive: false, streamerId: null },
                participants: Array.from(this.rooms.get(roomId) || []),
                messages: this.messages.get(roomId) || []
            });
            // Notify others
            socket.to(roomId).emit('user_joined', { userId, socketId: socket.id });
        }
        catch (error) {
            console.error('Error in handleJoinRoom:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    }
    handleLeaveRoom(socket, roomId) {
        try {
            socket.leave(roomId);
            this.rooms.get(roomId)?.delete(socket.id);
            this.updateRoomActivity(roomId);
            socket.to(roomId).emit('user_left', { socketId: socket.id });
        }
        catch (error) {
            console.error('Error in handleLeaveRoom:', error);
        }
    }
    handleMessage(socket, roomId, message) {
        try {
            const fullMessage = {
                ...message,
                timestamp: new Date().toISOString()
            };
            if (!this.messages.has(roomId)) {
                this.messages.set(roomId, []);
            }
            this.messages.get(roomId).push(fullMessage);
            // Limit message history
            if (this.messages.get(roomId).length > this.MAX_MESSAGES_PER_ROOM) {
                this.messages.get(roomId).shift();
            }
            this.updateRoomActivity(roomId);
            this.io.to(roomId).emit('new_message', fullMessage);
        }
        catch (error) {
            console.error('Error in handleMessage:', error);
            socket.emit('error', { message: 'Failed to send message' });
        }
    }
    handleStartStream(socket, roomId, userId, quality) {
        try {
            const streamState = {
                isActive: true,
                streamerId: userId,
                quality
            };
            this.streams.set(roomId, streamState);
            this.io.to(roomId).emit('stream_started', streamState);
        }
        catch (error) {
            console.error('Error in handleStartStream:', error);
            socket.emit('error', { message: 'Failed to start stream' });
        }
    }
    handleStopStream(socket, roomId) {
        try {
            this.streams.delete(roomId);
            this.io.to(roomId).emit('stream_stopped');
        }
        catch (error) {
            console.error('Error in handleStopStream:', error);
            socket.emit('error', { message: 'Failed to stop stream' });
        }
    }
    handleDisconnect(socket) {
        try {
            // Remove socket from all rooms
            this.rooms.forEach((sockets, roomId) => {
                if (sockets.has(socket.id)) {
                    sockets.delete(socket.id);
                    this.io.to(roomId).emit('user_left', { socketId: socket.id });
                }
            });
        }
        catch (error) {
            console.error('Error in handleDisconnect:', error);
        }
    }
    handleWebRTCOffer(socket, data) {
        try {
            console.log(`Relaying WebRTC offer from ${socket.id} to ${data.peerId} in room ${data.roomId}`);
            // Relay offer to the target peer
            socket.to(data.peerId).emit('webrtc_offer', {
                fromPeerId: socket.id,
                offer: data.offer
            });
        }
        catch (error) {
            console.error('Error in handleWebRTCOffer:', error);
            socket.emit('error', { message: 'Failed to relay WebRTC offer' });
        }
    }
    handleWebRTCAnswer(socket, data) {
        try {
            console.log(`Relaying WebRTC answer from ${socket.id} to ${data.peerId} in room ${data.roomId}`);
            // Relay answer to the target peer
            socket.to(data.peerId).emit('webrtc_answer', {
                fromPeerId: socket.id,
                answer: data.answer
            });
        }
        catch (error) {
            console.error('Error in handleWebRTCAnswer:', error);
            socket.emit('error', { message: 'Failed to relay WebRTC answer' });
        }
    }
    handleWebRTCIceCandidate(socket, data) {
        try {
            console.log(`Relaying ICE candidate from ${socket.id} to ${data.peerId} in room ${data.roomId}`);
            // Relay ICE candidate to the target peer
            socket.to(data.peerId).emit('webrtc_ice_candidate', {
                fromPeerId: socket.id,
                candidate: data.candidate
            });
        }
        catch (error) {
            console.error('Error in handleWebRTCIceCandidate:', error);
            socket.emit('error', { message: 'Failed to relay ICE candidate' });
        }
    }
    setupForRoom(roomId) {
        try {
            if (!this.io)
                throw new SystemError('COMMS_NOT_INITIALIZED', 'Communication system not initialized');
            this.rooms.set(roomId, new Set());
            this.messages.set(roomId, []);
            console.log(`Communication setup for room: ${roomId}`);
        }
        catch (error) {
            throw new SystemError('COMMUNICATION_SETUP_FAILED', 'Failed to setup room communication');
        }
    }
    allocateResources(eventId) {
        try {
            // Resources are automatically allocated when users join the room
            console.log(`Resources allocated for event: ${eventId}`);
        }
        catch (error) {
            throw new SystemError('RESOURCE_ALLOCATION_FAILED', 'Failed to allocate resources');
        }
    }
    async deallocateResources(eventId) {
        try {
            // Clean up all room resources including metadata
            this.cleanupRoom(eventId);
            if (this.io) {
                const sockets = await this.io.in(eventId).fetchSockets();
                sockets.forEach(socket => socket.leave(eventId));
            }
            console.log(`Resources deallocated for event: ${eventId}`);
        }
        catch (error) {
            throw new SystemError('RESOURCE_DEALLOCATION_FAILED', 'Failed to deallocate resources');
        }
    }
    async getResourceStatus(eventId) {
        try {
            const hasRoom = this.rooms.has(eventId);
            const stream = this.streams.get(eventId);
            return {
                websocket: hasRoom,
                webrtc: !!stream?.isActive,
                resources: {
                    allocated: hasRoom,
                    type: 'lecture',
                },
            };
        }
        catch (error) {
            throw new SystemError('RESOURCE_STATUS_FAILED', 'Failed to get resource status');
        }
    }
    /**
     * Update room activity timestamp and participant count
     */
    updateRoomActivity(roomId) {
        const metadata = this.roomMetadata.get(roomId);
        if (metadata) {
            metadata.lastActivity = new Date();
            metadata.participantCount = this.rooms.get(roomId)?.size || 0;
        }
    }
    /**
     * Start periodic cleanup task to remove stale rooms
     */
    startCleanupTask() {
        if (this.cleanupIntervalId) {
            clearInterval(this.cleanupIntervalId);
        }
        this.cleanupIntervalId = setInterval(() => {
            this.cleanupStaleRooms();
        }, this.CLEANUP_INTERVAL_MS);
        console.log(`Memory cleanup task started (interval: ${this.CLEANUP_INTERVAL_MS}ms)`);
    }
    /**
     * Clean up rooms that are stale (no participants and past TTL)
     */
    cleanupStaleRooms() {
        const now = Date.now();
        let cleanedCount = 0;
        for (const [roomId, metadata] of this.roomMetadata.entries()) {
            const participantCount = this.rooms.get(roomId)?.size || 0;
            const timeSinceActivity = now - metadata.lastActivity.getTime();
            // Clean up room if:
            // 1. No participants AND past TTL
            // 2. OR room count exceeds max (LRU eviction)
            if (participantCount === 0 && timeSinceActivity > this.ROOM_TTL_MS) {
                this.cleanupRoom(roomId);
                cleanedCount++;
            }
        }
        // If we still exceed MAX_ROOMS, evict oldest rooms
        if (this.rooms.size > this.MAX_ROOMS) {
            const sortedRooms = Array.from(this.roomMetadata.entries())
                .sort((a, b) => a[1].lastActivity.getTime() - b[1].lastActivity.getTime());
            const roomsToRemove = sortedRooms.slice(0, this.rooms.size - this.MAX_ROOMS);
            roomsToRemove.forEach(([roomId]) => {
                if ((this.rooms.get(roomId)?.size || 0) === 0) {
                    this.cleanupRoom(roomId);
                    cleanedCount++;
                }
            });
        }
        if (cleanedCount > 0) {
            console.log(`Cleaned up ${cleanedCount} stale rooms. Current room count: ${this.rooms.size}`);
        }
    }
    /**
     * Clean up all data associated with a room
     */
    cleanupRoom(roomId) {
        this.rooms.delete(roomId);
        this.streams.delete(roomId);
        this.messages.delete(roomId);
        this.roomMetadata.delete(roomId);
    }
    /**
     * Stop cleanup task and clean up resources
     */
    shutdown() {
        if (this.cleanupIntervalId) {
            clearInterval(this.cleanupIntervalId);
            this.cleanupIntervalId = null;
        }
        // Close all socket connections
        if (this.io) {
            this.io.close();
            this.io = null;
        }
        // Clear all maps
        this.rooms.clear();
        this.streams.clear();
        this.messages.clear();
        this.roomMetadata.clear();
        console.log('RealTimeCommunicationSystem shutdown complete');
    }
    /**
     * Get memory usage statistics
     */
    getMemoryStats() {
        return {
            roomCount: this.rooms.size,
            totalParticipants: Array.from(this.rooms.values()).reduce((sum, set) => sum + set.size, 0),
            activeStreams: Array.from(this.streams.values()).filter(s => s.isActive).length,
            totalMessages: Array.from(this.messages.values()).reduce((sum, arr) => sum + arr.length, 0),
            oldestRoom: this.getOldestRoomAge(),
            memoryLimits: {
                maxRooms: this.MAX_ROOMS,
                roomTTL: this.ROOM_TTL_MS,
                maxMessagesPerRoom: this.MAX_MESSAGES_PER_ROOM
            }
        };
    }
    /**
     * Get age of oldest room in milliseconds
     */
    getOldestRoomAge() {
        let oldest = 0;
        const now = Date.now();
        for (const metadata of this.roomMetadata.values()) {
            const age = now - metadata.createdAt.getTime();
            if (age > oldest) {
                oldest = age;
            }
        }
        return oldest;
    }
}
