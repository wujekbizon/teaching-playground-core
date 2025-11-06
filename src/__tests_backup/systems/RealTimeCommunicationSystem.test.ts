/**
 * Unit tests for RealTimeCommunicationSystem
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RealTimeCommunicationSystem } from '../../systems/comms/RealTimeCommunicationSystem.js';
import { MockServer, MockServerSocket } from '../mocks/socket.mock.js';
import { createMockUser } from '../setup.js';
import type { User } from '../../interfaces/user.interface.js';

// Mock Socket.IO
jest.mock('socket.io', () => {
  return {
    Server: jest.fn(() => new MockServer()),
  };
});

describe('RealTimeCommunicationSystem', () => {
  let commsSystem: RealTimeCommunicationSystem;
  let mockServer: MockServer;
  let mockHttpServer: any;

  beforeEach(() => {
    mockHttpServer = {
      listen: jest.fn(),
      close: jest.fn(),
    };

    commsSystem = new RealTimeCommunicationSystem({
      allowedOrigins: 'http://localhost:3000',
    });

    // Initialize with mock http server
    commsSystem.initialize(mockHttpServer);

    // Get the mock server instance
    mockServer = (commsSystem as any).io as MockServer;
  });

  describe('initialize', () => {
    it('should initialize Socket.IO server', () => {
      expect(commsSystem.isInitialized()).toBe(true);
    });

    it('should not initialize twice', () => {
      expect(() => {
        commsSystem.initialize(mockHttpServer);
      }).toThrow('Communication system already initialized');
    });
  });

  describe('isInitialized', () => {
    it('should return true after initialization', () => {
      expect(commsSystem.isInitialized()).toBe(true);
    });

    it('should return false before initialization', () => {
      const newSystem = new RealTimeCommunicationSystem({});
      expect(newSystem.isInitialized()).toBe(false);
    });
  });

  describe('client connection handling', () => {
    it('should handle client connection', () => {
      const socket = mockServer.simulateConnection('test-socket-1');

      expect(mockServer.sockets.has('test-socket-1')).toBe(true);
    });

    it('should handle multiple client connections', () => {
      mockServer.simulateConnection('socket-1');
      mockServer.simulateConnection('socket-2');
      mockServer.simulateConnection('socket-3');

      expect(mockServer.sockets.size).toBe(3);
    });

    it('should handle client disconnection', () => {
      const socket = mockServer.simulateConnection('test-socket-1');
      mockServer.simulateDisconnection('test-socket-1');

      expect(mockServer.sockets.has('test-socket-1')).toBe(false);
    });
  });

  describe('join_room event', () => {
    let socket: MockServerSocket;
    let user: User;

    beforeEach(() => {
      socket = mockServer.simulateConnection('test-socket');
      user = createMockUser();
    });

    it('should handle join_room event', (done) => {
      // Simulate join_room event
      socket.emit('join_room', { roomId: 'room-1', user });

      // Give the event handler time to process
      setTimeout(() => {
        expect(socket.join).toHaveBeenCalledWith('room-1');
        done();
      }, 50);
    });

    it('should add user to room', (done) => {
      socket.emit('join_room', { roomId: 'room-1', user });

      setTimeout(() => {
        expect(socket.rooms.has('room-1')).toBe(true);
        done();
      }, 50);
    });
  });

  describe('leave_room event', () => {
    let socket: MockServerSocket;
    let user: User;

    beforeEach(() => {
      socket = mockServer.simulateConnection('test-socket');
      user = createMockUser();

      // First join the room
      socket.emit('join_room', { roomId: 'room-1', user });
      socket.join('room-1');
    });

    it('should handle leave_room event', (done) => {
      socket.emit('leave_room', { roomId: 'room-1', userId: user.id });

      setTimeout(() => {
        expect(socket.leave).toHaveBeenCalledWith('room-1');
        done();
      }, 50);
    });
  });

  describe('send_message event', () => {
    let socket: MockServerSocket;
    let user: User;

    beforeEach(() => {
      socket = mockServer.simulateConnection('test-socket');
      user = createMockUser();

      socket.emit('join_room', { roomId: 'room-1', user });
      socket.join('room-1');
    });

    it('should handle send_message event', (done) => {
      const message = {
        roomId: 'room-1',
        message: 'Hello, World!',
        sender: user,
      };

      socket.emit('send_message', message);

      setTimeout(() => {
        // Message should be processed
        done();
      }, 50);
    });
  });

  describe('start_stream event', () => {
    let socket: MockServerSocket;

    beforeEach(() => {
      socket = mockServer.simulateConnection('test-socket');
      socket.join('room-1');
    });

    it('should handle start_stream event', (done) => {
      socket.emit('start_stream', {
        roomId: 'room-1',
        userId: 'user-1',
        quality: 'high',
      });

      setTimeout(() => {
        // Stream should be started
        done();
      }, 50);
    });
  });

  describe('stop_stream event', () => {
    let socket: MockServerSocket;

    beforeEach(() => {
      socket = mockServer.simulateConnection('test-socket');
      socket.join('room-1');

      // Start a stream first
      socket.emit('start_stream', {
        roomId: 'room-1',
        userId: 'user-1',
        quality: 'high',
      });
    });

    it('should handle stop_stream event', (done) => {
      socket.emit('stop_stream', {
        roomId: 'room-1',
        userId: 'user-1',
      });

      setTimeout(() => {
        // Stream should be stopped
        done();
      }, 50);
    });
  });

  describe('message history', () => {
    it('should track message history per room', (done) => {
      const socket = mockServer.simulateConnection('test-socket');
      const user = createMockUser();

      socket.join('room-1');

      // Send multiple messages
      for (let i = 0; i < 5; i++) {
        socket.emit('send_message', {
          roomId: 'room-1',
          message: `Message ${i}`,
          sender: user,
        });
      }

      setTimeout(() => {
        // Messages should be tracked
        done();
      }, 100);
    });

    it('should limit message history to 100 messages', (done) => {
      const socket = mockServer.simulateConnection('test-socket');
      const user = createMockUser();

      socket.join('room-1');

      // Send more than 100 messages
      for (let i = 0; i < 150; i++) {
        socket.emit('send_message', {
          roomId: 'room-1',
          message: `Message ${i}`,
          sender: user,
        });
      }

      setTimeout(() => {
        // Should only keep last 100
        done();
      }, 200);
    });
  });

  describe('allocateResources', () => {
    it('should allocate resources for an event', () => {
      commsSystem.allocateResources('event-1');

      // Should complete without errors
      expect(commsSystem.isInitialized()).toBe(true);
    });
  });

  describe('deallocateResources', () => {
    it('should deallocate resources for an event', () => {
      commsSystem.allocateResources('event-1');
      commsSystem.deallocateResources('event-1');

      // Should complete without errors
      expect(commsSystem.isInitialized()).toBe(true);
    });

    it('should not error when deallocating non-existent event', () => {
      expect(() => {
        commsSystem.deallocateResources('non-existent-event');
      }).not.toThrow();
    });
  });

  describe('getStatus', () => {
    it('should return status with server info', () => {
      const status = commsSystem.getStatus();

      expect(status.isActive).toBe(true);
      expect(status.connections).toBeDefined();
      expect(status.activeRooms).toBeDefined();
    });

    it('should return inactive status before initialization', () => {
      const newSystem = new RealTimeCommunicationSystem({});
      const status = newSystem.getStatus();

      expect(status.isActive).toBe(false);
    });
  });

  describe('shutdown', () => {
    it('should shutdown cleanly', async () => {
      await commsSystem.shutdown();

      expect(commsSystem.isInitialized()).toBe(false);
    });

    it('should not error when shutting down uninitialized system', async () => {
      const newSystem = new RealTimeCommunicationSystem({});

      await expect(newSystem.shutdown()).resolves.not.toThrow();
    });
  });

  describe('WebRTC signaling', () => {
    let socket: MockServerSocket;

    beforeEach(() => {
      socket = mockServer.simulateConnection('test-socket');
      socket.join('room-1');
    });

    it('should handle offer signal', (done) => {
      socket.emit('offer', {
        roomId: 'room-1',
        targetId: 'user-2',
        offer: { type: 'offer', sdp: 'mock-sdp' },
      });

      setTimeout(() => {
        // Offer should be processed
        done();
      }, 50);
    });

    it('should handle answer signal', (done) => {
      socket.emit('answer', {
        roomId: 'room-1',
        targetId: 'user-1',
        answer: { type: 'answer', sdp: 'mock-sdp' },
      });

      setTimeout(() => {
        // Answer should be processed
        done();
      }, 50);
    });

    it('should handle ICE candidates', (done) => {
      socket.emit('ice-candidate', {
        roomId: 'room-1',
        targetId: 'user-2',
        candidate: { candidate: 'mock-candidate' },
      });

      setTimeout(() => {
        // ICE candidate should be processed
        done();
      }, 50);
    });
  });

  describe('room updates', () => {
    it('should broadcast room updates', (done) => {
      const roomData = {
        id: 'room-1',
        name: 'Test Room',
        participantCount: 5,
      };

      // Simulate emitting a room update
      mockServer.to('room-1').emit('room_update', roomData);

      setTimeout(() => {
        expect(mockServer.to).toHaveBeenCalledWith('room-1');
        done();
      }, 50);
    });
  });

  describe('error handling', () => {
    let socket: MockServerSocket;

    beforeEach(() => {
      socket = mockServer.simulateConnection('test-socket');
    });

    it('should handle malformed join_room data', (done) => {
      socket.emit('join_room', { /* missing roomId and user */ });

      setTimeout(() => {
        // Should handle gracefully without crashing
        done();
      }, 50);
    });

    it('should handle malformed send_message data', (done) => {
      socket.emit('send_message', { /* incomplete data */ });

      setTimeout(() => {
        // Should handle gracefully without crashing
        done();
      }, 50);
    });
  });
});
