/**
 * Mock implementations for Socket.IO for testing
 */

import { jest } from '@jest/globals';
import EventEmitter from 'eventemitter3';

export class MockSocket extends EventEmitter {
  id: string;
  connected: boolean;
  disconnected: boolean;
  data: any;

  constructor(id = 'mock-socket-id') {
    super();
    this.id = id;
    this.connected = false;
    this.disconnected = true;
    this.data = {};
  }

  connect = jest.fn(() => {
    this.connected = true;
    this.disconnected = false;
    this.emit('connect');
    return this;
  });

  disconnect = jest.fn(() => {
    this.connected = false;
    this.disconnected = true;
    this.emit('disconnect');
    return this;
  });

  close = jest.fn(() => {
    this.disconnect();
  });

  // Socket.IO client methods
  on = jest.fn((event: string, handler: (...args: any[]) => void) => {
    super.on(event, handler);
    return this;
  });

  once = jest.fn((event: string, handler: (...args: any[]) => void) => {
    super.once(event, handler);
    return this;
  });

  off = jest.fn((event: string, handler?: (...args: any[]) => void) => {
    super.off(event, handler);
    return this;
  });

  // Emit to simulate receiving events from server
  simulateServerEvent = (event: string, ...args: any[]) => {
    this.emit(event, ...args);
  };
}

export class MockServerSocket extends EventEmitter {
  id: string;
  rooms: Set<string>;
  data: any;
  handshake: any;

  constructor(id = 'mock-server-socket-id') {
    super();
    this.id = id;
    this.rooms = new Set([id]); // Socket always in its own room
    this.data = {};
    this.handshake = {
      auth: {},
      headers: {},
    };
  }

  join = jest.fn((room: string) => {
    this.rooms.add(room);
    return Promise.resolve();
  });

  leave = jest.fn((room: string) => {
    this.rooms.delete(room);
    return Promise.resolve();
  });

  to = jest.fn((room: string) => {
    return {
      emit: jest.fn(),
      except: jest.fn(() => ({ emit: jest.fn() })),
    };
  });

  in = jest.fn((room: string) => this.to(room));

  broadcast = {
    to: jest.fn((room: string) => ({
      emit: jest.fn(),
    })),
    emit: jest.fn(),
  };

  disconnect = jest.fn((close?: boolean) => {
    this.emit('disconnect', 'forced disconnect');
  });
}

export class MockServer extends EventEmitter {
  sockets: Map<string, MockServerSocket>;

  constructor() {
    super();
    this.sockets = new Map();
  }

  to = jest.fn((room: string) => ({
    emit: jest.fn(),
  }));

  in = jest.fn((room: string) => this.to(room));

  emit = jest.fn();

  // Helper to simulate client connection
  simulateConnection = (socketId = 'test-socket-id') => {
    const socket = new MockServerSocket(socketId);
    this.sockets.set(socketId, socket);
    this.emit('connection', socket);
    return socket;
  };

  // Helper to simulate client disconnection
  simulateDisconnection = (socketId: string) => {
    const socket = this.sockets.get(socketId);
    if (socket) {
      socket.disconnect();
      this.sockets.delete(socketId);
    }
  };
}

// Mock Socket.IO modules
export const createMockSocketIOClient = () => {
  const mockSocket = new MockSocket();

  const io = jest.fn(() => mockSocket);

  return { io, mockSocket };
};

export const createMockSocketIOServer = () => {
  const mockServer = new MockServer();

  const Server = jest.fn(() => mockServer);

  return { Server, mockServer };
};
