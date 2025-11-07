import { describe, test, expect } from '@jest/globals';

/**
 * Basic package validation tests
 * These tests ensure the package structure is valid and can be imported.
 *
 * Comprehensive integration tests should be done in real applications.
 */

describe('Package Exports', () => {
  test('should export TeachingPlayground', async () => {
    const module = await import('../engine/TeachingPlayground');
    expect(module.default).toBeDefined();
    expect(typeof module.default).toBe('function');
  });

  test('should export RoomConnection', async () => {
    const { RoomConnection } = await import('../services/RoomConnection');
    expect(RoomConnection).toBeDefined();
    expect(typeof RoomConnection).toBe('function');
  });

  test('should export RoomManagementSystem', async () => {
    const { RoomManagementSystem } = await import('../systems/room/RoomManagementSystem');
    expect(RoomManagementSystem).toBeDefined();
    expect(typeof RoomManagementSystem).toBe('function');
  });

  test('should export EventManagementSystem', async () => {
    const { EventManagementSystem } = await import('../systems/event/EventManagementSystem');
    expect(EventManagementSystem).toBeDefined();
    expect(typeof EventManagementSystem).toBe('function');
  });

  test('should export RealTimeCommunicationSystem', async () => {
    const { RealTimeCommunicationSystem } = await import('../systems/comms/RealTimeCommunicationSystem');
    expect(RealTimeCommunicationSystem).toBeDefined();
    expect(typeof RealTimeCommunicationSystem).toBe('function');
  });
});

describe('Package Structure', () => {
  test('should have valid interfaces', async () => {
    const interfaces = await import('../interfaces/room.interface');
    expect(interfaces).toBeDefined();
  });

  test('should have valid schemas', async () => {
    const schemas = await import('../interfaces/schema');
    expect(schemas).toBeDefined();
  });
});
