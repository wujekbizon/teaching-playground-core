/**
 * Unit tests for JsonDatabase
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { JsonDatabase } from '../../utils/JsonDatabase.js';
import fs from 'fs';
import path from 'path';
import { createMockRoom, createMockLecture } from '../setup.js';

describe('JsonDatabase', () => {
  let db: JsonDatabase;
  const testDataPath = path.join(process.cwd(), 'data', 'test-data-test.json');

  beforeEach(() => {
    // Create a fresh instance for each test
    // Note: JsonDatabase is a singleton, so we need to be careful
    db = JsonDatabase.getInstance();

    // Clean up any existing test data
    if (fs.existsSync(testDataPath)) {
      fs.unlinkSync(testDataPath);
    }
  });

  afterEach(() => {
    // Clean up test data after each test
    if (fs.existsSync(testDataPath)) {
      fs.unlinkSync(testDataPath);
    }
  });

  describe('getInstance', () => {
    it('should return the same instance (singleton pattern)', () => {
      const instance1 = JsonDatabase.getInstance();
      const instance2 = JsonDatabase.getInstance();

      expect(instance1).toBe(instance2);
    });
  });

  describe('insert', () => {
    it('should insert a document into a collection', () => {
      const room = createMockRoom();

      const inserted = db.insert('rooms', room);

      expect(inserted).toEqual(room);
    });

    it('should insert multiple documents', () => {
      const room1 = createMockRoom({ id: 'room-1' });
      const room2 = createMockRoom({ id: 'room-2' });

      db.insert('rooms', room1);
      db.insert('rooms', room2);

      const all = db.find('rooms', {});

      expect(all).toHaveLength(2);
    });

    it('should handle inserting into events collection', () => {
      const lecture = createMockLecture();

      const inserted = db.insert('events', lecture);

      expect(inserted).toEqual(lecture);
    });
  });

  describe('find', () => {
    beforeEach(() => {
      const room1 = createMockRoom({ id: 'room-1', name: 'Room 1', status: 'available' });
      const room2 = createMockRoom({ id: 'room-2', name: 'Room 2', status: 'occupied' });
      const room3 = createMockRoom({ id: 'room-3', name: 'Room 3', status: 'available' });

      db.insert('rooms', room1);
      db.insert('rooms', room2);
      db.insert('rooms', room3);
    });

    it('should find all documents when query is empty', () => {
      const results = db.find('rooms', {});

      expect(results).toHaveLength(3);
    });

    it('should find documents matching query', () => {
      const results = db.find('rooms', { status: 'available' });

      expect(results).toHaveLength(2);
      expect(results.every(r => r.status === 'available')).toBe(true);
    });

    it('should find documents matching multiple criteria', () => {
      const results = db.find('rooms', { status: 'available', name: 'Room 1' });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('room-1');
    });

    it('should return empty array when no documents match', () => {
      const results = db.find('rooms', { status: 'maintenance' });

      expect(results).toEqual([]);
    });
  });

  describe('findOne', () => {
    beforeEach(() => {
      const room1 = createMockRoom({ id: 'room-1', name: 'Room 1' });
      const room2 = createMockRoom({ id: 'room-2', name: 'Room 2' });

      db.insert('rooms', room1);
      db.insert('rooms', room2);
    });

    it('should find a single document matching query', () => {
      const result = db.findOne('rooms', { id: 'room-1' });

      expect(result).toBeDefined();
      expect(result?.id).toBe('room-1');
    });

    it('should return undefined when no document matches', () => {
      const result = db.findOne('rooms', { id: 'non-existent' });

      expect(result).toBeUndefined();
    });

    it('should return first matching document when multiple match', () => {
      const room3 = createMockRoom({ id: 'room-3', status: 'available' });
      db.insert('rooms', room3);

      const result = db.findOne('rooms', { status: 'available' });

      expect(result).toBeDefined();
      // Should return one of the available rooms
      expect(result?.status).toBe('available');
    });
  });

  describe('update', () => {
    beforeEach(() => {
      const room1 = createMockRoom({ id: 'room-1', name: 'Room 1', status: 'available' });
      const room2 = createMockRoom({ id: 'room-2', name: 'Room 2', status: 'available' });

      db.insert('rooms', room1);
      db.insert('rooms', room2);
    });

    it('should update documents matching query', () => {
      const count = db.update('rooms', { id: 'room-1' }, { status: 'occupied' });

      expect(count).toBe(1);

      const updated = db.findOne('rooms', { id: 'room-1' });
      expect(updated?.status).toBe('occupied');
    });

    it('should update multiple documents', () => {
      const count = db.update('rooms', { status: 'available' }, { status: 'maintenance' });

      expect(count).toBe(2);

      const updated = db.find('rooms', { status: 'maintenance' });
      expect(updated).toHaveLength(2);
    });

    it('should return 0 when no documents match', () => {
      const count = db.update('rooms', { id: 'non-existent' }, { status: 'occupied' });

      expect(count).toBe(0);
    });

    it('should preserve other fields when updating', () => {
      db.update('rooms', { id: 'room-1' }, { status: 'occupied' });

      const updated = db.findOne('rooms', { id: 'room-1' });
      expect(updated?.name).toBe('Room 1'); // Name should be preserved
      expect(updated?.status).toBe('occupied'); // Status should be updated
    });
  });

  describe('delete', () => {
    beforeEach(() => {
      const room1 = createMockRoom({ id: 'room-1', status: 'available' });
      const room2 = createMockRoom({ id: 'room-2', status: 'available' });
      const room3 = createMockRoom({ id: 'room-3', status: 'occupied' });

      db.insert('rooms', room1);
      db.insert('rooms', room2);
      db.insert('rooms', room3);
    });

    it('should delete documents matching query', () => {
      const count = db.delete('rooms', { id: 'room-1' });

      expect(count).toBe(1);

      const remaining = db.find('rooms', {});
      expect(remaining).toHaveLength(2);
    });

    it('should delete multiple documents', () => {
      const count = db.delete('rooms', { status: 'available' });

      expect(count).toBe(2);

      const remaining = db.find('rooms', {});
      expect(remaining).toHaveLength(1);
      expect(remaining[0].status).toBe('occupied');
    });

    it('should return 0 when no documents match', () => {
      const count = db.delete('rooms', { id: 'non-existent' });

      expect(count).toBe(0);

      const remaining = db.find('rooms', {});
      expect(remaining).toHaveLength(3);
    });
  });

  describe('getAllParticipants', () => {
    it('should return all participants', () => {
      const participant1 = { id: 'user-1', roomId: 'room-1', username: 'user1' };
      const participant2 = { id: 'user-2', roomId: 'room-1', username: 'user2' };

      db.insert('participants', participant1);
      db.insert('participants', participant2);

      const participants = db.getAllParticipants();

      expect(participants).toHaveLength(2);
    });

    it('should return empty array when no participants exist', () => {
      const participants = db.getAllParticipants();

      expect(participants).toEqual([]);
    });
  });

  describe('clearParticipants', () => {
    it('should clear all participants', () => {
      const participant1 = { id: 'user-1', roomId: 'room-1' };
      const participant2 = { id: 'user-2', roomId: 'room-1' };

      db.insert('participants', participant1);
      db.insert('participants', participant2);

      db.clearParticipants();

      const participants = db.getAllParticipants();
      expect(participants).toEqual([]);
    });
  });

  describe('updateParticipant', () => {
    beforeEach(() => {
      const participant1 = { id: 'user-1', roomId: 'room-1', isStreaming: false };
      const participant2 = { id: 'user-2', roomId: 'room-1', isStreaming: false };

      db.insert('participants', participant1);
      db.insert('participants', participant2);
    });

    it('should update a participant', () => {
      const updated = db.updateParticipant('user-1', { isStreaming: true });

      expect(updated).toBeDefined();
      expect(updated?.isStreaming).toBe(true);
    });

    it('should return undefined when participant not found', () => {
      const updated = db.updateParticipant('non-existent', { isStreaming: true });

      expect(updated).toBeUndefined();
    });
  });

  describe('data persistence', () => {
    it('should persist data to file system on server', () => {
      // This test verifies that data is saved to disk
      const room = createMockRoom();
      db.insert('rooms', room);

      // Check if data file was created
      const dataPath = path.join(process.cwd(), 'data', 'test-data.json');

      // Give it a moment to write
      setTimeout(() => {
        expect(fs.existsSync(dataPath)).toBe(true);
      }, 100);
    });
  });

  describe('collection types', () => {
    it('should handle events collection', () => {
      const lecture = createMockLecture();
      db.insert('events', lecture);

      const found = db.findOne('events', { id: lecture.id });
      expect(found).toEqual(lecture);
    });

    it('should handle rooms collection', () => {
      const room = createMockRoom();
      db.insert('rooms', room);

      const found = db.findOne('rooms', { id: room.id });
      expect(found).toEqual(room);
    });

    it('should handle participants collection', () => {
      const participant = { id: 'user-1', roomId: 'room-1', username: 'test' };
      db.insert('participants', participant);

      const found = db.findOne('participants', { id: participant.id });
      expect(found).toEqual(participant);
    });
  });
});
