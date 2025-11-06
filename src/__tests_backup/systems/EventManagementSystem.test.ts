/**
 * Unit tests for EventManagementSystem
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventManagementSystem } from '../../systems/event/EventManagementSystem.js';
import { createMockLecture, createMockUser, createMockTeacher } from '../setup.js';
import type { Lecture, LectureStatus } from '../../interfaces/event.interface.js';

describe('EventManagementSystem', () => {
  let eventSystem: EventManagementSystem;

  beforeEach(() => {
    eventSystem = new EventManagementSystem({});
  });

  describe('createLecture', () => {
    it('should create a lecture with valid data', () => {
      const lectureData = {
        name: 'Test Lecture',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: 'room-1',
        teacherId: 'teacher-1',
        description: 'Test description',
        maxParticipants: 30,
      };

      const lecture = eventSystem.createLecture(lectureData);

      expect(lecture).toBeDefined();
      expect(lecture.id).toBeDefined();
      expect(lecture.name).toBe(lectureData.name);
      expect(lecture.date).toBe(lectureData.date);
      expect(lecture.roomId).toBe(lectureData.roomId);
      expect(lecture.teacherId).toBe(lectureData.teacherId);
      expect(lecture.status).toBe('scheduled');
      expect(lecture.type).toBe('lecture');
    });

    it('should throw error for invalid lecture data', () => {
      expect(() => {
        eventSystem.createLecture({
          name: '', // Empty name
          date: new Date().toISOString(),
          roomId: 'room-1',
          teacherId: 'teacher-1',
        });
      }).toThrow();
    });

    it('should throw error for past date', () => {
      expect(() => {
        eventSystem.createLecture({
          name: 'Test Lecture',
          date: new Date(Date.now() - 86400000).toISOString(), // Yesterday
          roomId: 'room-1',
          teacherId: 'teacher-1',
        });
      }).toThrow();
    });

    it('should create lecture with optional fields', () => {
      const lectureData = {
        name: 'Test Lecture',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: 'room-1',
        teacherId: 'teacher-1',
        description: 'Test description',
        maxParticipants: 50,
      };

      const lecture = eventSystem.createLecture(lectureData);

      expect(lecture.description).toBe(lectureData.description);
      expect(lecture.maxParticipants).toBe(lectureData.maxParticipants);
    });
  });

  describe('getLecture', () => {
    it('should retrieve an existing lecture', () => {
      const lectureData = {
        name: 'Test Lecture',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: 'room-1',
        teacherId: 'teacher-1',
      };

      const lecture = eventSystem.createLecture(lectureData);
      const retrieved = eventSystem.getLecture(lecture.id);

      expect(retrieved).toEqual(lecture);
    });

    it('should return undefined for non-existent lecture', () => {
      const retrieved = eventSystem.getLecture('non-existent-id');

      expect(retrieved).toBeUndefined();
    });
  });

  describe('updateLecture', () => {
    let lecture: Lecture;

    beforeEach(() => {
      lecture = eventSystem.createLecture({
        name: 'Test Lecture',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: 'room-1',
        teacherId: 'teacher-1',
      });
    });

    it('should update lecture name', () => {
      const updated = eventSystem.updateLecture(lecture.id, {
        name: 'Updated Lecture',
      });

      expect(updated.name).toBe('Updated Lecture');
    });

    it('should update lecture date', () => {
      const newDate = new Date(Date.now() + 172800000).toISOString(); // 2 days from now

      const updated = eventSystem.updateLecture(lecture.id, {
        date: newDate,
      });

      expect(updated.date).toBe(newDate);
    });

    it('should update lecture description', () => {
      const updated = eventSystem.updateLecture(lecture.id, {
        description: 'New description',
      });

      expect(updated.description).toBe('New description');
    });

    it('should throw error for non-existent lecture', () => {
      expect(() => {
        eventSystem.updateLecture('non-existent-id', { name: 'Test' });
      }).toThrow();
    });

    it('should throw error when updating to past date', () => {
      expect(() => {
        eventSystem.updateLecture(lecture.id, {
          date: new Date(Date.now() - 86400000).toISOString(), // Yesterday
        });
      }).toThrow();
    });

    it('should update updatedAt timestamp', () => {
      const originalUpdatedAt = lecture.updatedAt;

      setTimeout(() => {
        const updated = eventSystem.updateLecture(lecture.id, {
          name: 'Updated',
        });

        expect(updated.updatedAt).not.toBe(originalUpdatedAt);
      }, 10);
    });
  });

  describe('deleteLecture', () => {
    it('should delete an existing lecture', () => {
      const lecture = eventSystem.createLecture({
        name: 'Test Lecture',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: 'room-1',
        teacherId: 'teacher-1',
      });

      eventSystem.deleteLecture(lecture.id);
      const retrieved = eventSystem.getLecture(lecture.id);

      expect(retrieved).toBeUndefined();
    });

    it('should throw error when deleting non-existent lecture', () => {
      expect(() => {
        eventSystem.deleteLecture('non-existent-id');
      }).toThrow();
    });
  });

  describe('getAllLectures', () => {
    it('should return empty array when no lectures exist', () => {
      const lectures = eventSystem.getAllLectures();

      expect(lectures).toEqual([]);
    });

    it('should return all lectures', () => {
      const lecture1 = eventSystem.createLecture({
        name: 'Lecture 1',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: 'room-1',
        teacherId: 'teacher-1',
      });

      const lecture2 = eventSystem.createLecture({
        name: 'Lecture 2',
        date: new Date(Date.now() + 172800000).toISOString(),
        roomId: 'room-2',
        teacherId: 'teacher-1',
      });

      const lectures = eventSystem.getAllLectures();

      expect(lectures).toHaveLength(2);
      expect(lectures).toContainEqual(lecture1);
      expect(lectures).toContainEqual(lecture2);
    });
  });

  describe('getLecturesByRoom', () => {
    beforeEach(() => {
      eventSystem.createLecture({
        name: 'Lecture 1',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: 'room-1',
        teacherId: 'teacher-1',
      });

      eventSystem.createLecture({
        name: 'Lecture 2',
        date: new Date(Date.now() + 172800000).toISOString(),
        roomId: 'room-1',
        teacherId: 'teacher-1',
      });

      eventSystem.createLecture({
        name: 'Lecture 3',
        date: new Date(Date.now() + 259200000).toISOString(),
        roomId: 'room-2',
        teacherId: 'teacher-1',
      });
    });

    it('should return lectures for a specific room', () => {
      const lectures = eventSystem.getLecturesByRoom('room-1');

      expect(lectures).toHaveLength(2);
      expect(lectures.every(l => l.roomId === 'room-1')).toBe(true);
    });

    it('should return empty array for room with no lectures', () => {
      const lectures = eventSystem.getLecturesByRoom('room-999');

      expect(lectures).toEqual([]);
    });
  });

  describe('getLecturesByTeacher', () => {
    beforeEach(() => {
      eventSystem.createLecture({
        name: 'Lecture 1',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: 'room-1',
        teacherId: 'teacher-1',
      });

      eventSystem.createLecture({
        name: 'Lecture 2',
        date: new Date(Date.now() + 172800000).toISOString(),
        roomId: 'room-2',
        teacherId: 'teacher-1',
      });

      eventSystem.createLecture({
        name: 'Lecture 3',
        date: new Date(Date.now() + 259200000).toISOString(),
        roomId: 'room-3',
        teacherId: 'teacher-2',
      });
    });

    it('should return lectures for a specific teacher', () => {
      const lectures = eventSystem.getLecturesByTeacher('teacher-1');

      expect(lectures).toHaveLength(2);
      expect(lectures.every(l => l.teacherId === 'teacher-1')).toBe(true);
    });

    it('should return empty array for teacher with no lectures', () => {
      const lectures = eventSystem.getLecturesByTeacher('teacher-999');

      expect(lectures).toEqual([]);
    });
  });

  describe('getLecturesByStatus', () => {
    beforeEach(() => {
      const lecture1 = eventSystem.createLecture({
        name: 'Lecture 1',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: 'room-1',
        teacherId: 'teacher-1',
      });

      const lecture2 = eventSystem.createLecture({
        name: 'Lecture 2',
        date: new Date(Date.now() + 172800000).toISOString(),
        roomId: 'room-2',
        teacherId: 'teacher-1',
      });

      eventSystem.updateLectureStatus(lecture2.id, 'in-progress');
    });

    it('should return lectures with specific status', () => {
      const scheduled = eventSystem.getLecturesByStatus('scheduled');
      const inProgress = eventSystem.getLecturesByStatus('in-progress');

      expect(scheduled).toHaveLength(1);
      expect(inProgress).toHaveLength(1);
      expect(scheduled[0].status).toBe('scheduled');
      expect(inProgress[0].status).toBe('in-progress');
    });

    it('should return empty array for status with no lectures', () => {
      const completed = eventSystem.getLecturesByStatus('completed');

      expect(completed).toEqual([]);
    });
  });

  describe('updateLectureStatus', () => {
    let lecture: Lecture;

    beforeEach(() => {
      lecture = eventSystem.createLecture({
        name: 'Test Lecture',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: 'room-1',
        teacherId: 'teacher-1',
      });
    });

    it('should update status from scheduled to in-progress', () => {
      eventSystem.updateLectureStatus(lecture.id, 'in-progress');
      const updated = eventSystem.getLecture(lecture.id);

      expect(updated?.status).toBe('in-progress');
    });

    it('should update status from in-progress to completed', () => {
      eventSystem.updateLectureStatus(lecture.id, 'in-progress');
      eventSystem.updateLectureStatus(lecture.id, 'completed');
      const updated = eventSystem.getLecture(lecture.id);

      expect(updated?.status).toBe('completed');
    });

    it('should update status from scheduled to cancelled', () => {
      eventSystem.updateLectureStatus(lecture.id, 'cancelled');
      const updated = eventSystem.getLecture(lecture.id);

      expect(updated?.status).toBe('cancelled');
    });

    it('should throw error for non-existent lecture', () => {
      expect(() => {
        eventSystem.updateLectureStatus('non-existent-id', 'in-progress');
      }).toThrow();
    });

    it('should throw error for invalid status transition', () => {
      eventSystem.updateLectureStatus(lecture.id, 'completed');

      expect(() => {
        eventSystem.updateLectureStatus(lecture.id, 'scheduled');
      }).toThrow('Invalid status transition');
    });
  });

  describe('cancelLecture', () => {
    let lecture: Lecture;

    beforeEach(() => {
      lecture = eventSystem.createLecture({
        name: 'Test Lecture',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: 'room-1',
        teacherId: 'teacher-1',
      });
    });

    it('should cancel a scheduled lecture', () => {
      eventSystem.cancelLecture(lecture.id);
      const updated = eventSystem.getLecture(lecture.id);

      expect(updated?.status).toBe('cancelled');
    });

    it('should cancel an in-progress lecture', () => {
      eventSystem.updateLectureStatus(lecture.id, 'in-progress');
      eventSystem.cancelLecture(lecture.id);
      const updated = eventSystem.getLecture(lecture.id);

      expect(updated?.status).toBe('cancelled');
    });

    it('should throw error when cancelling already cancelled lecture', () => {
      eventSystem.cancelLecture(lecture.id);

      expect(() => {
        eventSystem.cancelLecture(lecture.id);
      }).toThrow();
    });

    it('should throw error when cancelling completed lecture', () => {
      eventSystem.updateLectureStatus(lecture.id, 'in-progress');
      eventSystem.updateLectureStatus(lecture.id, 'completed');

      expect(() => {
        eventSystem.cancelLecture(lecture.id);
      }).toThrow();
    });

    it('should throw error for non-existent lecture', () => {
      expect(() => {
        eventSystem.cancelLecture('non-existent-id');
      }).toThrow();
    });
  });

  describe('getLecturesInDateRange', () => {
    beforeEach(() => {
      const now = Date.now();
      eventSystem.createLecture({
        name: 'Lecture 1',
        date: new Date(now + 86400000).toISOString(), // 1 day
        roomId: 'room-1',
        teacherId: 'teacher-1',
      });

      eventSystem.createLecture({
        name: 'Lecture 2',
        date: new Date(now + 259200000).toISOString(), // 3 days
        roomId: 'room-2',
        teacherId: 'teacher-1',
      });

      eventSystem.createLecture({
        name: 'Lecture 3',
        date: new Date(now + 604800000).toISOString(), // 7 days
        roomId: 'room-3',
        teacherId: 'teacher-1',
      });
    });

    it('should return lectures within date range', () => {
      const now = Date.now();
      const startDate = new Date(now).toISOString();
      const endDate = new Date(now + 345600000).toISOString(); // 4 days

      const lectures = eventSystem.getLecturesInDateRange(startDate, endDate);

      expect(lectures).toHaveLength(2);
    });

    it('should return empty array when no lectures in range', () => {
      const now = Date.now();
      const startDate = new Date(now + 864000000).toISOString(); // 10 days
      const endDate = new Date(now + 1209600000).toISOString(); // 14 days

      const lectures = eventSystem.getLecturesInDateRange(startDate, endDate);

      expect(lectures).toEqual([]);
    });
  });
});
