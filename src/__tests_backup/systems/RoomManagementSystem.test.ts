/**
 * Unit tests for RoomManagementSystem
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { RoomManagementSystem } from '../../systems/room/RoomManagementSystem.js';
import { createMockUser, createMockTeacher, createMockLecture } from '../setup.js';
import type { Room, RoomParticipant } from '../../interfaces/room.interface.js';
import type { User } from '../../interfaces/user.interface.js';

describe('RoomManagementSystem', () => {
  let roomSystem: RoomManagementSystem;

  beforeEach(() => {
    roomSystem = new RoomManagementSystem({});
  });

  describe('createRoom', () => {
    it('should create a room with default values', () => {
      const room = roomSystem.createRoom({
        name: 'Test Room',
        capacity: 30,
      });

      expect(room).toBeDefined();
      expect(room.id).toBeDefined();
      expect(room.name).toBe('Test Room');
      expect(room.capacity).toBe(30);
      expect(room.status).toBe('available');
      expect(room.participants).toEqual([]);
      expect(room.currentLecture).toBeNull();
      expect(room.createdAt).toBeDefined();
      expect(room.updatedAt).toBeDefined();
    });

    it('should create a room with custom features', () => {
      const features = {
        hasVideo: true,
        hasAudio: true,
        hasChat: false,
        hasWhiteboard: true,
        hasScreenShare: false,
      };

      const room = roomSystem.createRoom({
        name: 'Custom Room',
        capacity: 20,
        features,
      });

      expect(room.features).toEqual(features);
    });

    it('should create rooms with unique IDs', () => {
      const room1 = roomSystem.createRoom({ name: 'Room 1', capacity: 10 });
      const room2 = roomSystem.createRoom({ name: 'Room 2', capacity: 10 });

      expect(room1.id).not.toBe(room2.id);
    });

    it('should throw error if room name is empty', () => {
      expect(() => {
        roomSystem.createRoom({ name: '', capacity: 10 });
      }).toThrow();
    });

    it('should throw error if capacity is less than 1', () => {
      expect(() => {
        roomSystem.createRoom({ name: 'Test', capacity: 0 });
      }).toThrow();
    });
  });

  describe('getRoom', () => {
    it('should retrieve an existing room', () => {
      const room = roomSystem.createRoom({ name: 'Test Room', capacity: 30 });
      const retrieved = roomSystem.getRoom(room.id);

      expect(retrieved).toEqual(room);
    });

    it('should return undefined for non-existent room', () => {
      const retrieved = roomSystem.getRoom('non-existent-id');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('getAllRooms', () => {
    it('should return empty array when no rooms exist', () => {
      const rooms = roomSystem.getAllRooms();

      expect(rooms).toEqual([]);
    });

    it('should return all created rooms', () => {
      const room1 = roomSystem.createRoom({ name: 'Room 1', capacity: 10 });
      const room2 = roomSystem.createRoom({ name: 'Room 2', capacity: 20 });
      const room3 = roomSystem.createRoom({ name: 'Room 3', capacity: 30 });

      const rooms = roomSystem.getAllRooms();

      expect(rooms).toHaveLength(3);
      expect(rooms).toContainEqual(room1);
      expect(rooms).toContainEqual(room2);
      expect(rooms).toContainEqual(room3);
    });
  });

  describe('updateRoomStatus', () => {
    it('should update room status', () => {
      const room = roomSystem.createRoom({ name: 'Test Room', capacity: 30 });

      roomSystem.updateRoomStatus(room.id, 'occupied');
      const updated = roomSystem.getRoom(room.id);

      expect(updated?.status).toBe('occupied');
    });

    it('should update room updatedAt timestamp', () => {
      const room = roomSystem.createRoom({ name: 'Test Room', capacity: 30 });
      const originalUpdatedAt = room.updatedAt;

      // Wait a bit to ensure timestamp difference
      setTimeout(() => {
        roomSystem.updateRoomStatus(room.id, 'scheduled');
        const updated = roomSystem.getRoom(room.id);

        expect(updated?.updatedAt).not.toBe(originalUpdatedAt);
      }, 10);
    });

    it('should throw error for non-existent room', () => {
      expect(() => {
        roomSystem.updateRoomStatus('non-existent-id', 'occupied');
      }).toThrow();
    });
  });

  describe('addParticipant', () => {
    let room: Room;
    let user: User;

    beforeEach(() => {
      room = roomSystem.createRoom({ name: 'Test Room', capacity: 30 });
      user = createMockUser();
    });

    it('should add a participant to a room', () => {
      const participant = roomSystem.addParticipant(room.id, user);

      expect(participant).toBeDefined();
      expect(participant.id).toBe(user.id);
      expect(participant.username).toBe(user.username);
      expect(participant.joinedAt).toBeDefined();
    });

    it('should set correct permissions for student', () => {
      const participant = roomSystem.addParticipant(room.id, user);

      expect(participant.canStream).toBe(false);
      expect(participant.canChat).toBe(true);
      expect(participant.canScreenShare).toBe(false);
    });

    it('should set correct permissions for teacher', () => {
      const teacher = createMockTeacher();
      const participant = roomSystem.addParticipant(room.id, teacher);

      expect(participant.canStream).toBe(true);
      expect(participant.canChat).toBe(true);
      expect(participant.canScreenShare).toBe(true);
    });

    it('should add participant to room participants list', () => {
      roomSystem.addParticipant(room.id, user);
      const updated = roomSystem.getRoom(room.id);

      expect(updated?.participants).toHaveLength(1);
      expect(updated?.participants[0].id).toBe(user.id);
    });

    it('should throw error when adding to non-existent room', () => {
      expect(() => {
        roomSystem.addParticipant('non-existent-id', user);
      }).toThrow();
    });

    it('should throw error when room is at capacity', () => {
      const smallRoom = roomSystem.createRoom({ name: 'Small Room', capacity: 1 });
      const user1 = createMockUser({ id: 'user1' });
      const user2 = createMockUser({ id: 'user2' });

      roomSystem.addParticipant(smallRoom.id, user1);

      expect(() => {
        roomSystem.addParticipant(smallRoom.id, user2);
      }).toThrow('Room is at capacity');
    });

    it('should not add same participant twice', () => {
      roomSystem.addParticipant(room.id, user);

      expect(() => {
        roomSystem.addParticipant(room.id, user);
      }).toThrow();
    });
  });

  describe('removeParticipant', () => {
    let room: Room;
    let user: User;

    beforeEach(() => {
      room = roomSystem.createRoom({ name: 'Test Room', capacity: 30 });
      user = createMockUser();
      roomSystem.addParticipant(room.id, user);
    });

    it('should remove a participant from a room', () => {
      roomSystem.removeParticipant(room.id, user.id);
      const updated = roomSystem.getRoom(room.id);

      expect(updated?.participants).toHaveLength(0);
    });

    it('should not throw error when removing non-existent participant', () => {
      expect(() => {
        roomSystem.removeParticipant(room.id, 'non-existent-user-id');
      }).not.toThrow();
    });

    it('should throw error when removing from non-existent room', () => {
      expect(() => {
        roomSystem.removeParticipant('non-existent-id', user.id);
      }).toThrow();
    });
  });

  describe('getParticipants', () => {
    let room: Room;

    beforeEach(() => {
      room = roomSystem.createRoom({ name: 'Test Room', capacity: 30 });
    });

    it('should return empty array for room with no participants', () => {
      const participants = roomSystem.getParticipants(room.id);

      expect(participants).toEqual([]);
    });

    it('should return all participants in a room', () => {
      const user1 = createMockUser({ id: 'user1' });
      const user2 = createMockUser({ id: 'user2' });
      const user3 = createMockUser({ id: 'user3' });

      roomSystem.addParticipant(room.id, user1);
      roomSystem.addParticipant(room.id, user2);
      roomSystem.addParticipant(room.id, user3);

      const participants = roomSystem.getParticipants(room.id);

      expect(participants).toHaveLength(3);
    });

    it('should throw error for non-existent room', () => {
      expect(() => {
        roomSystem.getParticipants('non-existent-id');
      }).toThrow();
    });
  });

  describe('assignLecture', () => {
    let room: Room;
    let lecture: any;

    beforeEach(() => {
      room = roomSystem.createRoom({ name: 'Test Room', capacity: 30 });
      lecture = createMockLecture({ roomId: room.id });
    });

    it('should assign a lecture to a room', () => {
      roomSystem.assignLecture(room.id, lecture);
      const updated = roomSystem.getRoom(room.id);

      expect(updated?.currentLecture).toEqual(lecture);
      expect(updated?.status).toBe('scheduled');
    });

    it('should throw error when assigning to non-existent room', () => {
      expect(() => {
        roomSystem.assignLecture('non-existent-id', lecture);
      }).toThrow();
    });

    it('should throw error when room already has a lecture', () => {
      roomSystem.assignLecture(room.id, lecture);
      const lecture2 = createMockLecture({ id: 'lecture2', roomId: room.id });

      expect(() => {
        roomSystem.assignLecture(room.id, lecture2);
      }).toThrow('Room already has an assigned lecture');
    });
  });

  describe('startLecture', () => {
    let room: Room;
    let lecture: any;

    beforeEach(() => {
      room = roomSystem.createRoom({ name: 'Test Room', capacity: 30 });
      lecture = createMockLecture({ roomId: room.id });
      roomSystem.assignLecture(room.id, lecture);
    });

    it('should start a lecture', () => {
      roomSystem.startLecture(room.id);
      const updated = roomSystem.getRoom(room.id);

      expect(updated?.status).toBe('occupied');
    });

    it('should throw error when starting lecture in room without assigned lecture', () => {
      const emptyRoom = roomSystem.createRoom({ name: 'Empty Room', capacity: 30 });

      expect(() => {
        roomSystem.startLecture(emptyRoom.id);
      }).toThrow('No lecture assigned to this room');
    });

    it('should throw error for non-existent room', () => {
      expect(() => {
        roomSystem.startLecture('non-existent-id');
      }).toThrow();
    });
  });

  describe('endLecture', () => {
    let room: Room;
    let lecture: any;

    beforeEach(() => {
      room = roomSystem.createRoom({ name: 'Test Room', capacity: 30 });
      lecture = createMockLecture({ roomId: room.id });
      roomSystem.assignLecture(room.id, lecture);
      roomSystem.startLecture(room.id);
    });

    it('should end a lecture and clear participants', () => {
      const user = createMockUser();
      roomSystem.addParticipant(room.id, user);

      roomSystem.endLecture(room.id);
      const updated = roomSystem.getRoom(room.id);

      expect(updated?.currentLecture).toBeNull();
      expect(updated?.status).toBe('available');
      expect(updated?.participants).toHaveLength(0);
    });

    it('should throw error for non-existent room', () => {
      expect(() => {
        roomSystem.endLecture('non-existent-id');
      }).toThrow();
    });
  });

  describe('setParticipantStreamingStatus', () => {
    let room: Room;
    let teacher: User;

    beforeEach(() => {
      room = roomSystem.createRoom({ name: 'Test Room', capacity: 30 });
      teacher = createMockTeacher();
      roomSystem.addParticipant(room.id, teacher);
    });

    it('should set participant streaming status', () => {
      roomSystem.setParticipantStreamingStatus(room.id, teacher.id, true);
      const participants = roomSystem.getParticipants(room.id);

      expect(participants[0].isStreaming).toBe(true);
    });

    it('should throw error for non-existent room', () => {
      expect(() => {
        roomSystem.setParticipantStreamingStatus('non-existent-id', teacher.id, true);
      }).toThrow();
    });

    it('should throw error for non-existent participant', () => {
      expect(() => {
        roomSystem.setParticipantStreamingStatus(room.id, 'non-existent-user', true);
      }).toThrow('Participant not found in room');
    });
  });

  describe('clearParticipants', () => {
    let room: Room;

    beforeEach(() => {
      room = roomSystem.createRoom({ name: 'Test Room', capacity: 30 });
      const user1 = createMockUser({ id: 'user1' });
      const user2 = createMockUser({ id: 'user2' });
      roomSystem.addParticipant(room.id, user1);
      roomSystem.addParticipant(room.id, user2);
    });

    it('should clear all participants from a room', () => {
      roomSystem.clearParticipants(room.id);
      const participants = roomSystem.getParticipants(room.id);

      expect(participants).toHaveLength(0);
    });

    it('should throw error for non-existent room', () => {
      expect(() => {
        roomSystem.clearParticipants('non-existent-id');
      }).toThrow();
    });
  });
});
