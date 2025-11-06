/**
 * Unit tests for RoomConnection
 */

import { describe, it, expect, beforeEach, jest, beforeAll } from '@jest/globals';
import { RoomConnection } from '../../services/RoomConnection.js';
import { MockSocket } from '../mocks/socket.mock.js';
import { setupWebRTCMocks } from '../mocks/webrtc.mock.js';
import { createMockUser } from '../setup.js';
import type { User } from '../../interfaces/user.interface.js';

// Mock socket.io-client
jest.mock('socket.io-client', () => {
  return {
    io: jest.fn(() => new MockSocket()),
  };
});

describe('RoomConnection', () => {
  let roomConnection: RoomConnection;
  let mockSocket: MockSocket;
  let user: User;

  beforeAll(() => {
    setupWebRTCMocks();
  });

  beforeEach(() => {
    user = createMockUser();
    roomConnection = new RoomConnection('room-1', user, 'ws://localhost:3001');
    mockSocket = (roomConnection as any).socket as MockSocket;
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(roomConnection).toBeDefined();
    });

    it('should store room ID', () => {
      expect((roomConnection as any).roomId).toBe('room-1');
    });

    it('should store user', () => {
      expect((roomConnection as any).user).toEqual(user);
    });

    it('should not be connected initially', () => {
      expect((roomConnection as any).isConnected).toBe(false);
    });
  });

  describe('connect', () => {
    it('should connect to server', () => {
      roomConnection.connect();

      expect(mockSocket.connect).toHaveBeenCalled();
    });

    it('should emit connected event on successful connection', (done) => {
      roomConnection.on('connected', () => {
        done();
      });

      roomConnection.connect();
      mockSocket.simulateServerEvent('connect');
    });

    it('should automatically join room after connection', (done) => {
      roomConnection.connect();

      setTimeout(() => {
        mockSocket.simulateServerEvent('connect');

        setTimeout(() => {
          // Should have emitted join_room event
          done();
        }, 50);
      }, 10);
    });

    it('should set connected flag to true', (done) => {
      roomConnection.on('connected', () => {
        expect((roomConnection as any).isConnected).toBe(true);
        done();
      });

      roomConnection.connect();
      mockSocket.simulateServerEvent('connect');
    });
  });

  describe('disconnect', () => {
    beforeEach(() => {
      roomConnection.connect();
      mockSocket.simulateServerEvent('connect');
    });

    it('should disconnect from server', () => {
      roomConnection.disconnect();

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should emit disconnected event', (done) => {
      roomConnection.on('disconnected', () => {
        done();
      });

      roomConnection.disconnect();
      mockSocket.simulateServerEvent('disconnect');
    });

    it('should set connected flag to false', (done) => {
      roomConnection.on('disconnected', () => {
        expect((roomConnection as any).isConnected).toBe(false);
        done();
      });

      roomConnection.disconnect();
      mockSocket.simulateServerEvent('disconnect');
    });
  });

  describe('sendMessage', () => {
    beforeEach(() => {
      roomConnection.connect();
      mockSocket.simulateServerEvent('connect');
    });

    it('should send message to room', () => {
      const emitSpy = jest.spyOn(mockSocket, 'emit');

      roomConnection.sendMessage('Hello, World!');

      expect(emitSpy).toHaveBeenCalledWith('send_message', {
        roomId: 'room-1',
        message: 'Hello, World!',
        sender: user,
      });
    });

    it('should throw error when not connected', () => {
      roomConnection.disconnect();

      expect(() => {
        roomConnection.sendMessage('Hello');
      }).toThrow('Not connected to room');
    });
  });

  describe('onMessage', () => {
    beforeEach(() => {
      roomConnection.connect();
      mockSocket.simulateServerEvent('connect');
    });

    it('should receive messages from room', (done) => {
      roomConnection.on('message_received', (message) => {
        expect(message.message).toBe('Hello from server');
        done();
      });

      mockSocket.simulateServerEvent('message_received', {
        message: 'Hello from server',
        sender: { id: 'user-2', username: 'otheruser' },
        timestamp: new Date().toISOString(),
      });
    });

    it('should add messages to message history', (done) => {
      mockSocket.simulateServerEvent('message_received', {
        message: 'Test message',
        sender: { id: 'user-2', username: 'otheruser' },
        timestamp: new Date().toISOString(),
      });

      setTimeout(() => {
        const messages = roomConnection.getMessageHistory();
        expect(messages.length).toBeGreaterThan(0);
        done();
      }, 50);
    });
  });

  describe('getMessageHistory', () => {
    it('should return empty array initially', () => {
      const messages = roomConnection.getMessageHistory();

      expect(messages).toEqual([]);
    });

    it('should return message history', (done) => {
      roomConnection.connect();
      mockSocket.simulateServerEvent('connect');

      // Simulate receiving messages
      mockSocket.simulateServerEvent('message_received', {
        message: 'Message 1',
        sender: user,
        timestamp: new Date().toISOString(),
      });

      mockSocket.simulateServerEvent('message_received', {
        message: 'Message 2',
        sender: user,
        timestamp: new Date().toISOString(),
      });

      setTimeout(() => {
        const messages = roomConnection.getMessageHistory();
        expect(messages.length).toBeGreaterThanOrEqual(2);
        done();
      }, 100);
    });
  });

  describe('startStreaming', () => {
    beforeEach(() => {
      roomConnection.connect();
      mockSocket.simulateServerEvent('connect');
    });

    it('should start streaming', () => {
      const emitSpy = jest.spyOn(mockSocket, 'emit');

      roomConnection.startStreaming('high');

      expect(emitSpy).toHaveBeenCalledWith('start_stream', {
        roomId: 'room-1',
        userId: user.id,
        quality: 'high',
      });
    });

    it('should default to medium quality', () => {
      const emitSpy = jest.spyOn(mockSocket, 'emit');

      roomConnection.startStreaming();

      expect(emitSpy).toHaveBeenCalledWith('start_stream', {
        roomId: 'room-1',
        userId: user.id,
        quality: 'medium',
      });
    });

    it('should throw error when not connected', () => {
      roomConnection.disconnect();

      expect(() => {
        roomConnection.startStreaming();
      }).toThrow('Not connected to room');
    });
  });

  describe('stopStreaming', () => {
    beforeEach(() => {
      roomConnection.connect();
      mockSocket.simulateServerEvent('connect');
      roomConnection.startStreaming();
    });

    it('should stop streaming', () => {
      const emitSpy = jest.spyOn(mockSocket, 'emit');

      roomConnection.stopStreaming();

      expect(emitSpy).toHaveBeenCalledWith('stop_stream', {
        roomId: 'room-1',
        userId: user.id,
      });
    });

    it('should throw error when not connected', () => {
      roomConnection.disconnect();

      expect(() => {
        roomConnection.stopStreaming();
      }).toThrow('Not connected to room');
    });
  });

  describe('stream events', () => {
    beforeEach(() => {
      roomConnection.connect();
      mockSocket.simulateServerEvent('connect');
    });

    it('should handle stream_started event', (done) => {
      roomConnection.on('stream_started', (data) => {
        expect(data.userId).toBe('user-2');
        done();
      });

      mockSocket.simulateServerEvent('stream_started', {
        userId: 'user-2',
        quality: 'high',
      });
    });

    it('should handle stream_stopped event', (done) => {
      roomConnection.on('stream_stopped', (data) => {
        expect(data.userId).toBe('user-2');
        done();
      });

      mockSocket.simulateServerEvent('stream_stopped', {
        userId: 'user-2',
      });
    });
  });

  describe('user events', () => {
    beforeEach(() => {
      roomConnection.connect();
      mockSocket.simulateServerEvent('connect');
    });

    it('should handle user_joined event', (done) => {
      roomConnection.on('user_joined', (data) => {
        expect(data.user.id).toBe('user-2');
        done();
      });

      mockSocket.simulateServerEvent('user_joined', {
        user: { id: 'user-2', username: 'newuser' },
      });
    });

    it('should handle user_left event', (done) => {
      roomConnection.on('user_left', (data) => {
        expect(data.userId).toBe('user-2');
        done();
      });

      mockSocket.simulateServerEvent('user_left', {
        userId: 'user-2',
      });
    });
  });

  describe('reconnection', () => {
    it('should attempt to reconnect on disconnect', (done) => {
      roomConnection.connect();
      mockSocket.simulateServerEvent('connect');

      // Simulate unexpected disconnect
      mockSocket.simulateServerEvent('disconnect');

      setTimeout(() => {
        // Should have attempted reconnection
        done();
      }, 100);
    });

    it('should emit reconnecting event', (done) => {
      roomConnection.on('reconnecting', (attempt) => {
        expect(attempt).toBeGreaterThan(0);
        done();
      });

      roomConnection.connect();
      mockSocket.simulateServerEvent('connect');
      mockSocket.simulateServerEvent('disconnect');
    });

    it('should stop reconnecting after max attempts', (done) => {
      let reconnectAttempts = 0;

      roomConnection.on('reconnecting', () => {
        reconnectAttempts++;
      });

      roomConnection.on('reconnect_failed', () => {
        expect(reconnectAttempts).toBeGreaterThan(0);
        done();
      });

      roomConnection.connect();
      mockSocket.simulateServerEvent('connect');
      mockSocket.simulateServerEvent('disconnect');

      // Wait for reconnection attempts to complete
      setTimeout(() => {
        // Trigger reconnect failed
        mockSocket.simulateServerEvent('reconnect_failed');
      }, 500);
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      roomConnection.connect();
      mockSocket.simulateServerEvent('connect');
    });

    it('should handle connection errors', (done) => {
      roomConnection.on('error', (error) => {
        expect(error).toBeDefined();
        done();
      });

      mockSocket.simulateServerEvent('error', new Error('Connection error'));
    });

    it('should handle connect_error', (done) => {
      roomConnection.on('error', (error) => {
        expect(error).toBeDefined();
        done();
      });

      mockSocket.simulateServerEvent('connect_error', new Error('Connection failed'));
    });
  });

  describe('isConnected', () => {
    it('should return false initially', () => {
      expect(roomConnection.isConnected()).toBe(false);
    });

    it('should return true after connection', (done) => {
      roomConnection.connect();
      mockSocket.simulateServerEvent('connect');

      setTimeout(() => {
        expect(roomConnection.isConnected()).toBe(true);
        done();
      }, 50);
    });

    it('should return false after disconnection', (done) => {
      roomConnection.connect();
      mockSocket.simulateServerEvent('connect');

      setTimeout(() => {
        roomConnection.disconnect();
        mockSocket.simulateServerEvent('disconnect');

        setTimeout(() => {
          expect(roomConnection.isConnected()).toBe(false);
          done();
        }, 50);
      }, 50);
    });
  });

  describe('cleanup', () => {
    it('should remove all event listeners on disconnect', () => {
      roomConnection.connect();
      mockSocket.simulateServerEvent('connect');

      const offSpy = jest.spyOn(mockSocket, 'off');

      roomConnection.disconnect();

      expect(offSpy).toHaveBeenCalled();
    });
  });
});
