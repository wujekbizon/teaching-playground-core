import { SystemError } from '../../interfaces';
import { Server as SocketIOServer } from 'socket.io';
import { EventEmitter } from 'events';
export class RealTimeCommunicationSystem extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.io = null;
        this.rooms = new Map();
        this.streams = new Map();
        this.messages = new Map();
        this.roomLastActivity = new Map();
        this.cleanupInterval = null;
        this.messageLimiter = new Map();
        this.messageSequence = new Map();
        // Configuration
        this.INACTIVE_THRESHOLD = 30 * 60 * 1000; // 30 minutes
        this.CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
        this.MESSAGE_HISTORY_LIMIT = 100;
        this.RATE_LIMIT_MESSAGES = 5;
        this.RATE_LIMIT_WINDOW = 10000; // 10 seconds
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
        this.startAutomaticCleanup();
        console.log('RealTimeCommunicationSystem initialized');
    }
    startAutomaticCleanup() {
        // Start cleanup timer
        this.cleanupInterval = setInterval(() => {
            this.cleanupInactiveRooms();
        }, this.CLEANUP_INTERVAL);
        console.log('Automatic room cleanup started');
    }
    cleanupInactiveRooms() {
        const now = Date.now();
        const roomsToCleanup = [];
        for (const [roomId, lastActivity] of this.roomLastActivity.entries()) {
            if (now - lastActivity > this.INACTIVE_THRESHOLD) {
                const participants = this.rooms.get(roomId);
                if (!participants || participants.size === 0) {
                    roomsToCleanup.push(roomId);
                }
            }
        }
        // Cleanup identified rooms
        for (const roomId of roomsToCleanup) {
            console.log(`Auto-cleaning inactive room: ${roomId}`);
            this.deallocateResources(roomId).catch(error => {
                console.error(`Failed to cleanup room ${roomId}:`, error);
            });
        }
        if (roomsToCleanup.length > 0) {
            console.log(`Cleaned up ${roomsToCleanup.length} inactive rooms`);
        }
    }
    updateRoomActivity(roomId) {
        this.roomLastActivity.set(roomId, Date.now());
    }
    setupEventHandlers() {
        if (!this.io)
            throw new SystemError('COMMS_NOT_INITIALIZED', 'Communication system not initialized');
        this.io.on('connection', (socket) => {
            console.log(`Client connected: ${socket.id}`);
            // Room events
            socket.on('join_room', (data) => {
                this.handleJoinRoom(socket, data.roomId, data.user);
            });
            socket.on('leave_room', (roomId) => {
                this.handleLeaveRoom(socket, roomId);
            });
            // Chat events
            socket.on('send_message', (data) => {
                this.handleMessage(socket, data.roomId, data.message);
            });
            // Request message history
            socket.on('request_message_history', (roomId) => {
                this.handleRequestMessageHistory(socket, roomId);
            });
            // Stream events
            socket.on('start_stream', (data) => {
                this.handleStartStream(socket, data.roomId, data.userId, data.quality);
            });
            socket.on('stop_stream', (roomId) => {
                this.handleStopStream(socket, roomId);
            });
            // WebRTC signaling events
            socket.on('webrtc:offer', (data) => {
                this.handleWebRTCOffer(socket, data);
            });
            socket.on('webrtc:answer', (data) => {
                this.handleWebRTCAnswer(socket, data);
            });
            socket.on('webrtc:ice-candidate', (data) => {
                this.handleWebRTCIceCandidate(socket, data);
            });
            socket.on('disconnect', () => {
                this.handleDisconnect(socket);
            });
        });
    }
    handleJoinRoom(socket, roomId, user) {
        try {
            socket.join(roomId);
            if (!this.rooms.has(roomId)) {
                this.rooms.set(roomId, new Map());
            }
            const participant = {
                id: user.id,
                username: user.username,
                role: user.role,
                displayName: user.displayName,
                email: user.email,
                status: user.status,
                socketId: socket.id,
                joinedAt: new Date().toISOString(),
                canStream: user.role === 'teacher',
                canChat: true,
                canScreenShare: user.role === 'teacher',
                isStreaming: false
            };
            this.rooms.get(roomId).set(socket.id, participant);
            this.updateRoomActivity(roomId);
            socket.emit('welcome', {
                message: `Welcome to ${roomId}, ${user.username}`,
                timestamp: new Date().toISOString()
            });
            // Send room state WITHOUT messages (separate history)
            socket.emit('room_state', {
                stream: this.streams.get(roomId) || { isActive: false, streamerId: null, quality: 'high' },
                participants: Array.from(this.rooms.get(roomId).values())
            });
            // Notify others with full participant object
            socket.to(roomId).emit('user_joined', participant);
            console.log(`User ${user.username} joined room ${roomId}`);
        }
        catch (error) {
            console.error('Error in handleJoinRoom:', error);
            socket.emit('error', { message: 'Failed to join room' });
        }
    }
    handleRequestMessageHistory(socket, roomId) {
        try {
            // Send message history separately, only when requested
            const messages = this.messages.get(roomId) || [];
            socket.emit('message_history', { messages });
            console.log(`Sent ${messages.length} messages to ${socket.id} for room ${roomId}`);
        }
        catch (error) {
            console.error('Error in handleRequestMessageHistory:', error);
            socket.emit('error', { message: 'Failed to retrieve message history' });
        }
    }
    handleLeaveRoom(socket, roomId) {
        try {
            const participant = this.rooms.get(roomId)?.get(socket.id);
            socket.leave(roomId);
            this.rooms.get(roomId)?.delete(socket.id);
            if (participant) {
                socket.to(roomId).emit('user_left', participant);
                console.log(`User ${participant.username} left room ${roomId}`);
            }
            this.updateRoomActivity(roomId);
        }
        catch (error) {
            console.error('Error in handleLeaveRoom:', error);
        }
    }
    checkRateLimit(userId) {
        const now = Date.now();
        const limit = this.messageLimiter.get(userId);
        if (limit && now < limit.resetAt) {
            if (limit.count >= this.RATE_LIMIT_MESSAGES) {
                return false; // Rate limit exceeded
            }
            limit.count++;
        }
        else {
            this.messageLimiter.set(userId, {
                count: 1,
                resetAt: now + this.RATE_LIMIT_WINDOW
            });
        }
        return true;
    }
    handleMessage(socket, roomId, message) {
        try {
            // Rate limiting
            if (!this.checkRateLimit(message.userId)) {
                socket.emit('error', {
                    message: 'Rate limit exceeded. Please slow down.'
                });
                return;
            }
            // Get or initialize sequence number
            if (!this.messageSequence.has(roomId)) {
                this.messageSequence.set(roomId, 0);
            }
            const sequence = this.messageSequence.get(roomId) + 1;
            this.messageSequence.set(roomId, sequence);
            const fullMessage = {
                ...message,
                messageId: `${roomId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                sequence,
                timestamp: new Date().toISOString()
            };
            if (!this.messages.has(roomId)) {
                this.messages.set(roomId, []);
            }
            this.messages.get(roomId).push(fullMessage);
            // Limit message history
            const messageArray = this.messages.get(roomId);
            if (messageArray.length > this.MESSAGE_HISTORY_LIMIT) {
                messageArray.shift();
            }
            this.updateRoomActivity(roomId);
            // Broadcast to room (not in room_state!)
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
            // Update participant streaming status
            const participant = this.rooms.get(roomId)?.get(socket.id);
            if (participant) {
                participant.isStreaming = true;
            }
            this.updateRoomActivity(roomId);
            this.io.to(roomId).emit('stream_started', streamState);
            console.log(`Stream started in room ${roomId} by ${userId}`);
        }
        catch (error) {
            console.error('Error in handleStartStream:', error);
            socket.emit('error', { message: 'Failed to start stream' });
        }
    }
    handleStopStream(socket, roomId) {
        try {
            this.streams.delete(roomId);
            // Update participant streaming status
            const participant = this.rooms.get(roomId)?.get(socket.id);
            if (participant) {
                participant.isStreaming = false;
            }
            this.updateRoomActivity(roomId);
            this.io.to(roomId).emit('stream_stopped');
            console.log(`Stream stopped in room ${roomId}`);
        }
        catch (error) {
            console.error('Error in handleStopStream:', error);
            socket.emit('error', { message: 'Failed to stop stream' });
        }
    }
    // WebRTC Signaling Handlers
    handleWebRTCOffer(socket, data) {
        try {
            socket.to(data.targetPeerId).emit('webrtc:offer', {
                from: socket.id,
                offer: data.offer
            });
            console.log(`WebRTC offer sent from ${socket.id} to ${data.targetPeerId}`);
        }
        catch (error) {
            console.error('Error in handleWebRTCOffer:', error);
        }
    }
    handleWebRTCAnswer(socket, data) {
        try {
            socket.to(data.targetPeerId).emit('webrtc:answer', {
                from: socket.id,
                answer: data.answer
            });
            console.log(`WebRTC answer sent from ${socket.id} to ${data.targetPeerId}`);
        }
        catch (error) {
            console.error('Error in handleWebRTCAnswer:', error);
        }
    }
    handleWebRTCIceCandidate(socket, data) {
        try {
            socket.to(data.targetPeerId).emit('webrtc:ice-candidate', {
                from: socket.id,
                candidate: data.candidate
            });
        }
        catch (error) {
            console.error('Error in handleWebRTCIceCandidate:', error);
        }
    }
    handleDisconnect(socket) {
        try {
            // Remove socket from all rooms
            this.rooms.forEach((participants, roomId) => {
                const participant = participants.get(socket.id);
                if (participant) {
                    participants.delete(socket.id);
                    this.io.to(roomId).emit('user_left', participant);
                    this.updateRoomActivity(roomId);
                    console.log(`User ${participant.username} disconnected from room ${roomId}`);
                }
            });
        }
        catch (error) {
            console.error('Error in handleDisconnect:', error);
        }
    }
    setupForRoom(roomId) {
        try {
            if (!this.io)
                throw new SystemError('COMMS_NOT_INITIALIZED', 'Communication system not initialized');
            this.rooms.set(roomId, new Map());
            this.messages.set(roomId, []);
            this.messageSequence.set(roomId, 0);
            this.updateRoomActivity(roomId);
            console.log(`Communication setup for room: ${roomId}`);
        }
        catch (error) {
            throw new SystemError('COMMUNICATION_SETUP_FAILED', 'Failed to setup room communication');
        }
    }
    allocateResources(eventId) {
        try {
            // Resources are automatically allocated when users join the room
            this.updateRoomActivity(eventId);
            console.log(`Resources allocated for event: ${eventId}`);
        }
        catch (error) {
            throw new SystemError('RESOURCE_ALLOCATION_FAILED', 'Failed to allocate resources');
        }
    }
    async deallocateResources(eventId) {
        try {
            // Notify all clients before cleanup
            if (this.io) {
                this.io.to(eventId).emit('room_closed', {
                    roomId: eventId,
                    reason: 'cleanup',
                    timestamp: new Date().toISOString()
                });
                // Disconnect all sockets from room
                const sockets = await this.io.in(eventId).fetchSockets();
                for (const socket of sockets) {
                    socket.leave(eventId);
                }
            }
            // Clean up room resources
            this.rooms.delete(eventId);
            this.streams.delete(eventId);
            this.messages.delete(eventId);
            this.roomLastActivity.delete(eventId);
            this.messageSequence.delete(eventId);
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
            const participantCount = this.rooms.get(eventId)?.size || 0;
            return {
                websocket: hasRoom,
                webrtc: !!stream?.isActive,
                participants: participantCount,
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
    async shutdown() {
        try {
            console.log('Shutting down RealTimeCommunicationSystem...');
            // Stop cleanup timer
            if (this.cleanupInterval) {
                clearInterval(this.cleanupInterval);
                this.cleanupInterval = null;
            }
            // Notify all clients
            if (this.io) {
                this.io.emit('server_shutdown', {
                    message: 'Server is shutting down',
                    timestamp: new Date().toISOString()
                });
                // Close all connections
                const sockets = await this.io.fetchSockets();
                for (const socket of sockets) {
                    socket.disconnect(true);
                }
                // Close server
                this.io.close();
                this.io = null;
            }
            // Clear all data
            this.rooms.clear();
            this.streams.clear();
            this.messages.clear();
            this.roomLastActivity.clear();
            this.messageLimiter.clear();
            this.messageSequence.clear();
            console.log('RealTimeCommunicationSystem shutdown complete');
        }
        catch (error) {
            console.error('Error during shutdown:', error);
            throw new SystemError('SHUTDOWN_FAILED', 'Failed to shutdown communication system');
        }
    }
}
