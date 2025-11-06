/**
 * Jest Test Setup File
 * This file runs before all tests to set up the testing environment
 */

import { jest } from '@jest/globals';

// Increase timeout for async operations
jest.setTimeout(10000);

// Mock console to reduce noise in tests (optional - can be removed if you want to see logs)
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  // Keep error for debugging
  error: console.error,
};

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.NEXT_PUBLIC_WS_URL = 'http://localhost:3000';

// Global test utilities
export const createMockUser = (overrides = {}) => ({
  id: 'test-user-1',
  username: 'testuser',
  role: 'student' as const,
  email: 'test@example.com',
  displayName: 'Test User',
  status: 'online' as const,
  ...overrides,
});

export const createMockTeacher = (overrides = {}) => ({
  id: 'test-teacher-1',
  username: 'testteacher',
  role: 'teacher' as const,
  email: 'teacher@example.com',
  displayName: 'Test Teacher',
  status: 'online' as const,
  subjects: ['Math', 'Science'],
  availability: {
    days: ['monday', 'tuesday', 'wednesday'],
    hours: { start: '09:00', end: '17:00' },
  },
  ...overrides,
});

export const createMockRoom = (overrides = {}) => ({
  id: 'test-room-1',
  name: 'Test Room',
  capacity: 30,
  status: 'available' as const,
  features: {
    hasVideo: true,
    hasAudio: true,
    hasChat: true,
    hasWhiteboard: true,
    hasScreenShare: true,
  },
  participants: [],
  currentLecture: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

export const createMockLecture = (overrides = {}) => ({
  id: 'test-lecture-1',
  name: 'Test Lecture',
  date: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
  roomId: 'test-room-1',
  type: 'lecture' as const,
  status: 'scheduled' as const,
  teacherId: 'test-teacher-1',
  createdBy: 'test-teacher-1',
  description: 'Test lecture description',
  maxParticipants: 30,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
});

// Cleanup after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global teardown
afterAll(() => {
  jest.restoreAllMocks();
});
