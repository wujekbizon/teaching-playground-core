/**
 * Integration tests for complete classroom flow
 */

import { describe, it, expect, beforeEach, jest, beforeAll } from '@jest/globals';
import TeachingPlayground from '../../engine/TeachingPlayground.js';
import { RoomConnection } from '../../services/RoomConnection.js';
import { createMockTeacher, createMockUser } from '../setup.js';
import { setupWebRTCMocks } from '../mocks/webrtc.mock.js';
import { MockSocket } from '../mocks/socket.mock.js';
import type { TeacherProfile, User } from '../../interfaces/user.interface.js';

// Mock socket.io-client
jest.mock('socket.io-client', () => {
  return {
    io: jest.fn(() => new MockSocket()),
  };
});

describe('Classroom Flow Integration Tests', () => {
  let playground: TeachingPlayground;
  let teacher: TeacherProfile;
  let student: User;

  beforeAll(() => {
    setupWebRTCMocks();
  });

  beforeEach(() => {
    playground = new TeachingPlayground({
      roomConfig: {},
      commsConfig: { allowedOrigins: 'http://localhost:3000' },
      eventConfig: {},
      dataConfig: {},
    });

    teacher = createMockTeacher();
    student = createMockUser();
  });

  describe('Complete classroom lifecycle', () => {
    it('should handle complete classroom creation to lecture flow', async () => {
      // Step 1: Teacher logs in
      playground.setCurrentUser(teacher);
      expect(playground.getCurrentUser()).toEqual(teacher);

      // Step 2: Create a classroom
      const classroom = playground.createClassroom({
        name: 'Introduction to TypeScript',
        capacity: 30,
        features: {
          hasVideo: true,
          hasAudio: true,
          hasChat: true,
          hasWhiteboard: true,
          hasScreenShare: true,
        },
      });

      expect(classroom).toBeDefined();
      expect(classroom.name).toBe('Introduction to TypeScript');
      expect(classroom.status).toBe('available');

      // Step 3: Schedule a lecture
      const lecture = await playground.scheduleLecture({
        name: 'TypeScript Basics',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: classroom.id,
        description: 'Learn TypeScript from scratch',
        maxParticipants: 30,
      });

      expect(lecture).toBeDefined();
      expect(lecture.teacherId).toBe(teacher.id);
      expect(lecture.status).toBe('scheduled');
      expect(lecture.roomId).toBe(classroom.id);

      // Step 4: Verify lecture appears in teacher's list
      const teacherLectures = await playground.getTeacherLectures();
      expect(teacherLectures).toHaveLength(1);
      expect(teacherLectures[0].id).toBe(lecture.id);

      // Step 5: Get lecture details
      const lectureDetails = await playground.getLectureDetails(lecture.id);
      expect(lectureDetails.name).toBe('TypeScript Basics');
      expect(lectureDetails.participants).toBeDefined();

      // Step 6: Check system status
      const systemStatus = playground.getSystemStatus();
      expect(systemStatus.rooms.totalRooms).toBe(1);
      expect(systemStatus.events.totalLectures).toBe(1);
    });

    it('should handle multiple students joining a classroom', async () => {
      // Setup: Create classroom and lecture
      playground.setCurrentUser(teacher);

      const classroom = playground.createClassroom({
        name: 'Math Class',
        capacity: 5,
      });

      const lecture = await playground.scheduleLecture({
        name: 'Algebra Basics',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: classroom.id,
      });

      // Create multiple students
      const student1 = createMockUser({ id: 'student-1', username: 'student1' });
      const student2 = createMockUser({ id: 'student-2', username: 'student2' });
      const student3 = createMockUser({ id: 'student-3', username: 'student3' });

      // Simulate students joining
      const roomSystem = (playground as any).roomManagementSystem;

      roomSystem.addParticipant(classroom.id, teacher);
      roomSystem.addParticipant(classroom.id, student1);
      roomSystem.addParticipant(classroom.id, student2);
      roomSystem.addParticipant(classroom.id, student3);

      // Verify all participants are in the room
      const participants = roomSystem.getParticipants(classroom.id);
      expect(participants).toHaveLength(4); // 1 teacher + 3 students

      // Verify teacher has streaming permissions
      const teacherParticipant = participants.find((p: any) => p.id === teacher.id);
      expect(teacherParticipant?.canStream).toBe(true);

      // Verify students don't have streaming permissions
      const studentParticipants = participants.filter((p: any) => p.id.startsWith('student'));
      expect(studentParticipants.every((p: any) => !p.canStream)).toBe(true);
    });

    it('should handle lecture lifecycle: schedule → start → end', async () => {
      // Setup
      playground.setCurrentUser(teacher);

      const classroom = playground.createClassroom({
        name: 'Science Lab',
        capacity: 20,
      });

      const lecture = await playground.scheduleLecture({
        name: 'Chemistry 101',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: classroom.id,
      });

      // Initial status should be scheduled
      expect(lecture.status).toBe('scheduled');

      // Get the systems
      const roomSystem = (playground as any).roomManagementSystem;
      const eventSystem = (playground as any).eventManagementSystem;

      // Start the lecture
      roomSystem.startLecture(classroom.id);
      eventSystem.updateLectureStatus(lecture.id, 'in-progress');

      // Verify room is occupied
      const updatedRoom = roomSystem.getRoom(classroom.id);
      expect(updatedRoom.status).toBe('occupied');

      // Verify lecture is in progress
      const inProgressLecture = eventSystem.getLecture(lecture.id);
      expect(inProgressLecture.status).toBe('in-progress');

      // Add some participants
      roomSystem.addParticipant(classroom.id, teacher);
      roomSystem.addParticipant(classroom.id, student);

      // End the lecture
      roomSystem.endLecture(classroom.id);
      eventSystem.updateLectureStatus(lecture.id, 'completed');

      // Verify room is available again
      const finalRoom = roomSystem.getRoom(classroom.id);
      expect(finalRoom.status).toBe('available');
      expect(finalRoom.participants).toHaveLength(0); // Participants cleared

      // Verify lecture is completed
      const completedLecture = eventSystem.getLecture(lecture.id);
      expect(completedLecture.status).toBe('completed');
    });

    it('should handle lecture cancellation', async () => {
      // Setup
      playground.setCurrentUser(teacher);

      const classroom = playground.createClassroom({
        name: 'History Class',
        capacity: 25,
      });

      const lecture = await playground.scheduleLecture({
        name: 'World War II',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: classroom.id,
      });

      expect(lecture.status).toBe('scheduled');

      // Cancel the lecture
      await playground.cancelLecture(lecture.id);

      // Verify lecture is cancelled
      const cancelledLecture = await playground.getLectureDetails(lecture.id);
      expect(cancelledLecture.status).toBe('cancelled');

      // Verify room is still available
      const roomSystem = (playground as any).roomManagementSystem;
      const room = roomSystem.getRoom(classroom.id);
      expect(room.status).toBe('available');
    });

    it('should handle room capacity limits', () => {
      playground.setCurrentUser(teacher);

      const smallRoom = playground.createClassroom({
        name: 'Small Room',
        capacity: 2,
      });

      const roomSystem = (playground as any).roomManagementSystem;

      // Add teacher
      roomSystem.addParticipant(smallRoom.id, teacher);

      // Add first student
      const student1 = createMockUser({ id: 'student-1' });
      roomSystem.addParticipant(smallRoom.id, student1);

      // Try to add second student (should fail - room at capacity)
      const student2 = createMockUser({ id: 'student-2' });

      expect(() => {
        roomSystem.addParticipant(smallRoom.id, student2);
      }).toThrow('Room is at capacity');

      // Verify only 2 participants in room
      const participants = roomSystem.getParticipants(smallRoom.id);
      expect(participants).toHaveLength(2);
    });

    it('should enforce authorization for lecture operations', async () => {
      // Teacher creates lecture
      playground.setCurrentUser(teacher);

      const classroom = playground.createClassroom({
        name: 'Authorized Class',
        capacity: 30,
      });

      const lecture = await playground.scheduleLecture({
        name: 'Authorized Lecture',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: classroom.id,
      });

      // Switch to student user
      playground.setCurrentUser(student);

      // Student should not be able to update lecture
      await expect(
        playground.updateLecture(lecture.id, { name: 'Hacked Lecture' })
      ).rejects.toThrow('Unauthorized');

      // Student should not be able to cancel lecture
      await expect(
        playground.cancelLecture(lecture.id)
      ).rejects.toThrow('Unauthorized');

      // Lecture should remain unchanged
      const unchangedLecture = await playground.getLectureDetails(lecture.id);
      expect(unchangedLecture.name).toBe('Authorized Lecture');
      expect(unchangedLecture.status).toBe('scheduled');
    });

    it('should handle concurrent classrooms', async () => {
      playground.setCurrentUser(teacher);

      // Create multiple classrooms
      const classroom1 = playground.createClassroom({
        name: 'Math 101',
        capacity: 30,
      });

      const classroom2 = playground.createClassroom({
        name: 'Physics 101',
        capacity: 25,
      });

      const classroom3 = playground.createClassroom({
        name: 'Chemistry 101',
        capacity: 20,
      });

      // Schedule lectures in each classroom
      const lecture1 = await playground.scheduleLecture({
        name: 'Algebra',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: classroom1.id,
      });

      const lecture2 = await playground.scheduleLecture({
        name: 'Mechanics',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: classroom2.id,
      });

      const lecture3 = await playground.scheduleLecture({
        name: 'Organic Chemistry',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: classroom3.id,
      });

      // Verify all lectures exist
      const allLectures = await playground.listLectures();
      expect(allLectures).toHaveLength(3);

      // Verify system status
      const systemStatus = playground.getSystemStatus();
      expect(systemStatus.rooms.totalRooms).toBe(3);
      expect(systemStatus.events.totalLectures).toBe(3);
    });

    it('should track participant streaming status', () => {
      playground.setCurrentUser(teacher);

      const classroom = playground.createClassroom({
        name: 'Streaming Class',
        capacity: 30,
      });

      const roomSystem = (playground as any).roomManagementSystem;

      // Add teacher
      roomSystem.addParticipant(classroom.id, teacher);

      // Verify teacher is not streaming initially
      let participants = roomSystem.getParticipants(classroom.id);
      expect(participants[0].isStreaming).toBeUndefined();

      // Teacher starts streaming
      roomSystem.setParticipantStreamingStatus(classroom.id, teacher.id, true);

      // Verify teacher is now streaming
      participants = roomSystem.getParticipants(classroom.id);
      expect(participants[0].isStreaming).toBe(true);

      // Teacher stops streaming
      roomSystem.setParticipantStreamingStatus(classroom.id, teacher.id, false);

      // Verify teacher is not streaming
      participants = roomSystem.getParticipants(classroom.id);
      expect(participants[0].isStreaming).toBe(false);
    });
  });

  describe('Error scenarios', () => {
    it('should handle invalid lecture dates', async () => {
      playground.setCurrentUser(teacher);

      const classroom = playground.createClassroom({
        name: 'Test Room',
        capacity: 30,
      });

      // Try to schedule lecture in the past
      await expect(
        playground.scheduleLecture({
          name: 'Past Lecture',
          date: new Date(Date.now() - 86400000).toISOString(),
          roomId: classroom.id,
        })
      ).rejects.toThrow();
    });

    it('should handle non-existent rooms', async () => {
      playground.setCurrentUser(teacher);

      await expect(
        playground.scheduleLecture({
          name: 'Test Lecture',
          date: new Date(Date.now() + 86400000).toISOString(),
          roomId: 'non-existent-room',
        })
      ).rejects.toThrow();
    });

    it('should handle duplicate lecture assignments to same room', async () => {
      playground.setCurrentUser(teacher);

      const classroom = playground.createClassroom({
        name: 'Busy Room',
        capacity: 30,
      });

      // Schedule first lecture
      await playground.scheduleLecture({
        name: 'Lecture 1',
        date: new Date(Date.now() + 86400000).toISOString(),
        roomId: classroom.id,
      });

      const roomSystem = (playground as any).roomManagementSystem;
      const room = roomSystem.getRoom(classroom.id);

      // Try to schedule second lecture in same room (should fail)
      await expect(
        playground.scheduleLecture({
          name: 'Lecture 2',
          date: new Date(Date.now() + 86400000).toISOString(),
          roomId: classroom.id,
        })
      ).rejects.toThrow();
    });
  });
});
