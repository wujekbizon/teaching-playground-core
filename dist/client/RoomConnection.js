import { io } from 'socket.io-client';
import { EventEmitter } from 'events';
export class RoomConnection extends EventEmitter {
    constructor(roomId, user, serverUrl) {
        super();
        this.socket = null;
        this.connected = false;
        this.messageHistory = [];
        this.currentStream = null;
        this.roomId = roomId;
        this.user = user;
        this.socket = io(serverUrl, {
            autoConnect: false,
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
        });
        this.setupSocketListeners();
    }
    setupSocketListeners() {
        if (!this.socket)
            return;
        this.socket.on('connect', () => {
            this.connected = true;
            this.emit('connected');
            this.joinRoom();
        });
        this.socket.on('disconnect', () => {
            this.connected = false;
            this.emit('disconnected');
        });
        this.socket.on('room_state', (state) => {
            this.messageHistory = state.messages;
            this.currentStream = state.stream;
            this.emit('room_state_updated', state);
        });
        this.socket.on('new_message', (message) => {
            this.messageHistory.push(message);
            if (this.messageHistory.length > 100) {
                this.messageHistory.shift();
            }
            this.emit('message_received', message);
        });
        this.socket.on('stream_started', (state) => {
            this.currentStream = state;
            this.emit('stream_started', state);
        });
        this.socket.on('stream_stopped', () => {
            this.currentStream = null;
            this.emit('stream_stopped');
        });
        this.socket.on('user_joined', (data) => {
            this.emit('user_joined', data);
        });
        this.socket.on('user_left', (data) => {
            this.emit('user_left', data);
        });
        this.socket.on('error', (error) => {
            this.emit('error', error);
        });
    }
    joinRoom() {
        if (!this.socket || !this.connected)
            return;
        this.socket.emit('join_room', this.roomId, this.user.id);
    }
    connect() {
        if (this.socket && !this.connected) {
            this.socket.connect();
        }
    }
    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
    }
    sendMessage(content) {
        if (!this.socket || !this.connected)
            return false;
        const message = {
            userId: this.user.id,
            username: this.user.username,
            content
        };
        this.socket.emit('send_message', this.roomId, message);
        return true;
    }
    startStream(quality = 'medium') {
        if (!this.socket || !this.connected)
            return false;
        this.socket.emit('start_stream', this.roomId, this.user.id, quality);
        return true;
    }
    stopStream() {
        if (!this.socket || !this.connected)
            return false;
        this.socket.emit('stop_stream', this.roomId);
        return true;
    }
    getMessageHistory() {
        return [...this.messageHistory];
    }
    getCurrentStream() {
        return this.currentStream;
    }
    isConnected() {
        return this.connected;
    }
}
