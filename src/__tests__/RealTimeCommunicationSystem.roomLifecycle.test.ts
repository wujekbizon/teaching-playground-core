/**
 * v1.4.6: Room Lifecycle Validation Tests
 * Tests for room-lecture mapping and lecture status validation
 */

import { RealTimeCommunicationSystem } from '../systems/comms/RealTimeCommunicationSystem'
import { User } from '../interfaces/user.interface'
import { Server as SocketIOServer } from 'socket.io'
import { createServer } from 'http'

describe('RealTimeCommunicationSystem - Room Lifecycle (v1.4.6)', () => {
  let commsSystem: RealTimeCommunicationSystem
  let httpServer: any
  let io: SocketIOServer
  let mockSocket: any

  const teacherUser: User = {
    id: 'teacher-1',
    username: 'teacher@example.com',
    role: 'teacher',
    status: 'online'
  }

  const studentUser: User = {
    id: 'student-1',
    username: 'student@example.com',
    role: 'student',
    status: 'online'
  }

  beforeEach(() => {
    // Create HTTP server and Socket.IO instance
    httpServer = createServer()
    io = new SocketIOServer(httpServer)

    commsSystem = new RealTimeCommunicationSystem()
    ;(commsSystem as any).io = io

    // Mock socket with emit tracking
    mockSocket = {
      id: 'socket-123',
      emit: jest.fn(),
      join: jest.fn(),
      to: jest.fn().mockReturnThis()
    }
  })

  afterEach(() => {
    httpServer.close()
  })

  describe('registerLecture()', () => {
    it('should register a lecture for a room', () => {
      const lectureId = 'lecture-1'
      const roomId = 'room-1'

      commsSystem.registerLecture(lectureId, roomId, 'active')

      // Verify lecture is registered
      expect(commsSystem.isRoomAvailable(roomId)).toBe(true)
    })

    it('should register lecture with correct status', () => {
      const lectureId = 'lecture-2'
      const roomId = 'room-2'

      commsSystem.registerLecture(lectureId, roomId, 'in-progress')

      // Access private maps to verify
      const roomLectureMap = (commsSystem as any).roomLectureMap
      const lectureLookup = (commsSystem as any).lectureLookup

      expect(roomLectureMap.get(roomId)).toBe(lectureId)
      expect(lectureLookup.get(lectureId)).toEqual({
        id: lectureId,
        status: 'in-progress',
        roomId
      })
    })

    it('should log registration', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      const lectureId = 'lecture-3'
      const roomId = 'room-3'

      commsSystem.registerLecture(lectureId, roomId, 'active')

      expect(consoleSpy).toHaveBeenCalledWith(
        `Registered lecture ${lectureId} for room ${roomId} with status 'active'`
      )

      consoleSpy.mockRestore()
    })
  })

  describe('updateLectureStatus()', () => {
    beforeEach(() => {
      // Register a lecture first
      commsSystem.registerLecture('lecture-1', 'room-1', 'active')
    })

    it('should update lecture status', () => {
      commsSystem.updateLectureStatus('lecture-1', 'completed')

      const lectureLookup = (commsSystem as any).lectureLookup
      const lecture = lectureLookup.get('lecture-1')

      expect(lecture.status).toBe('completed')
    })

    it('should mark room as unavailable when lecture is completed', () => {
      commsSystem.updateLectureStatus('lecture-1', 'completed')

      expect(commsSystem.isRoomAvailable('room-1')).toBe(false)
    })

    it('should mark room as unavailable when lecture is cancelled', () => {
      commsSystem.updateLectureStatus('lecture-1', 'cancelled')

      expect(commsSystem.isRoomAvailable('room-1')).toBe(false)
    })

    it('should keep room available when lecture is in-progress', () => {
      commsSystem.updateLectureStatus('lecture-1', 'in-progress')

      expect(commsSystem.isRoomAvailable('room-1')).toBe(true)
    })

    it('should log status update', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      commsSystem.updateLectureStatus('lecture-1', 'completed')

      expect(consoleSpy).toHaveBeenCalledWith(
        `Updated lecture lecture-1 status to 'completed'`
      )

      consoleSpy.mockRestore()
    })

    it('should warn when updating unknown lecture', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      commsSystem.updateLectureStatus('unknown-lecture', 'completed')

      expect(consoleSpy).toHaveBeenCalledWith(
        'Attempted to update status for unknown lecture unknown-lecture'
      )

      consoleSpy.mockRestore()
    })
  })

  describe('unregisterLecture()', () => {
    beforeEach(() => {
      commsSystem.registerLecture('lecture-1', 'room-1', 'active')
    })

    it('should unregister a lecture', () => {
      commsSystem.unregisterLecture('lecture-1')

      const roomLectureMap = (commsSystem as any).roomLectureMap
      const lectureLookup = (commsSystem as any).lectureLookup

      expect(roomLectureMap.has('room-1')).toBe(false)
      expect(lectureLookup.has('lecture-1')).toBe(false)
    })

    it('should mark room as unavailable after unregister', () => {
      commsSystem.unregisterLecture('lecture-1')

      expect(commsSystem.isRoomAvailable('room-1')).toBe(false)
    })

    it('should log unregistration', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      commsSystem.unregisterLecture('lecture-1')

      expect(consoleSpy).toHaveBeenCalledWith(
        'Unregistered lecture lecture-1 from room room-1'
      )

      consoleSpy.mockRestore()
    })

    it('should warn when unregistering unknown lecture', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      commsSystem.unregisterLecture('unknown-lecture')

      expect(consoleSpy).toHaveBeenCalledWith(
        'Attempted to unregister unknown lecture unknown-lecture'
      )

      consoleSpy.mockRestore()
    })
  })

  describe('isRoomAvailable()', () => {
    it('should return false for room with no lecture', () => {
      expect(commsSystem.isRoomAvailable('room-1')).toBe(false)
    })

    it('should return true for room with active lecture', () => {
      commsSystem.registerLecture('lecture-1', 'room-1', 'active')

      expect(commsSystem.isRoomAvailable('room-1')).toBe(true)
    })

    it('should return true for room with in-progress lecture', () => {
      commsSystem.registerLecture('lecture-1', 'room-1', 'in-progress')

      expect(commsSystem.isRoomAvailable('room-1')).toBe(true)
    })

    it('should return false for room with completed lecture', () => {
      commsSystem.registerLecture('lecture-1', 'room-1', 'completed')

      expect(commsSystem.isRoomAvailable('room-1')).toBe(false)
    })

    it('should return false for room with cancelled lecture', () => {
      commsSystem.registerLecture('lecture-1', 'room-1', 'cancelled')

      expect(commsSystem.isRoomAvailable('room-1')).toBe(false)
    })

    it('should return false for room with scheduled lecture', () => {
      commsSystem.registerLecture('lecture-1', 'room-1', 'scheduled')

      expect(commsSystem.isRoomAvailable('room-1')).toBe(false)
    })

    it('should return false for room with delayed lecture', () => {
      commsSystem.registerLecture('lecture-1', 'room-1', 'delayed')

      expect(commsSystem.isRoomAvailable('room-1')).toBe(false)
    })
  })

  describe('handleJoinRoom() with lecture validation', () => {
    beforeEach(() => {
      // Mock the private handleJoinRoom method
      ;(commsSystem as any).updateRoomActivity = jest.fn()
    })

    it('should allow joining room with active lecture', () => {
      commsSystem.registerLecture('lecture-1', 'room-1', 'active')

      ;(commsSystem as any).handleJoinRoom(mockSocket, 'room-1', studentUser)

      expect(mockSocket.join).toHaveBeenCalledWith('room-1')
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'welcome',
        expect.objectContaining({
          message: expect.stringContaining('Welcome to room-1')
        })
      )
    })

    it('should allow joining room with in-progress lecture', () => {
      commsSystem.registerLecture('lecture-1', 'room-1', 'in-progress')

      ;(commsSystem as any).handleJoinRoom(mockSocket, 'room-1', studentUser)

      expect(mockSocket.join).toHaveBeenCalledWith('room-1')
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'welcome',
        expect.objectContaining({
          message: expect.stringContaining('Welcome to room-1')
        })
      )
    })

    it('should deny joining room with completed lecture', () => {
      commsSystem.registerLecture('lecture-1', 'room-1', 'completed')

      ;(commsSystem as any).handleJoinRoom(mockSocket, 'room-1', studentUser)

      expect(mockSocket.join).not.toHaveBeenCalled()
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'join_room_error',
        {
          code: 'ROOM_UNAVAILABLE',
          message: 'This lecture has ended',
          lectureStatus: 'completed',
          roomId: 'room-1'
        }
      )
    })

    it('should deny joining room with cancelled lecture', () => {
      commsSystem.registerLecture('lecture-1', 'room-1', 'cancelled')

      ;(commsSystem as any).handleJoinRoom(mockSocket, 'room-1', studentUser)

      expect(mockSocket.join).not.toHaveBeenCalled()
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'join_room_error',
        {
          code: 'ROOM_UNAVAILABLE',
          message: 'This lecture has been cancelled',
          lectureStatus: 'cancelled',
          roomId: 'room-1'
        }
      )
    })

    it('should deny joining room with scheduled lecture', () => {
      commsSystem.registerLecture('lecture-1', 'room-1', 'scheduled')

      ;(commsSystem as any).handleJoinRoom(mockSocket, 'room-1', studentUser)

      expect(mockSocket.join).not.toHaveBeenCalled()
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'join_room_error',
        {
          code: 'ROOM_UNAVAILABLE',
          message: 'This lecture has not started yet',
          lectureStatus: 'scheduled',
          roomId: 'room-1'
        }
      )
    })

    it('should log denied entry', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      commsSystem.registerLecture('lecture-1', 'room-1', 'completed')

      ;(commsSystem as any).handleJoinRoom(mockSocket, 'room-1', studentUser)

      expect(consoleSpy).toHaveBeenCalledWith(
        `User ${studentUser.username} denied entry to room room-1 - Lecture status: completed`
      )

      consoleSpy.mockRestore()
    })

    it('should allow joining room with no registered lecture', () => {
      // No lecture registered - should allow join (backward compatibility)
      ;(commsSystem as any).handleJoinRoom(mockSocket, 'room-1', studentUser)

      expect(mockSocket.join).toHaveBeenCalledWith('room-1')
      expect(mockSocket.emit).toHaveBeenCalledWith(
        'welcome',
        expect.objectContaining({
          message: expect.stringContaining('Welcome to room-1')
        })
      )
    })
  })

  describe('Chat message logging', () => {
    beforeEach(() => {
      // Set up room with participants
      const participants = new Map()
      participants.set(mockSocket.id, {
        id: studentUser.id,
        username: studentUser.username,
        role: studentUser.role,
        status: studentUser.status,
        socketId: mockSocket.id,
        joinedAt: new Date().toISOString(),
        canStream: false,
        canChat: true,
        canScreenShare: false,
        isStreaming: false,
        handRaised: false
      })
      ;(commsSystem as any).rooms.set('room-1', participants)
      ;(commsSystem as any).updateRoomActivity = jest.fn()
    })

    it('should log short chat messages', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      const message = {
        userId: studentUser.id,
        username: studentUser.username,
        content: 'Hello everyone!'
      }

      ;(commsSystem as any).handleMessage(mockSocket, 'room-1', message)

      expect(consoleSpy).toHaveBeenCalledWith(
        `Chat message from ${studentUser.username} in room room-1: Hello everyone!`
      )

      consoleSpy.mockRestore()
    })

    it('should truncate long chat messages in logs', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      const longMessage = 'A'.repeat(100) // 100 characters
      const message = {
        userId: studentUser.id,
        username: studentUser.username,
        content: longMessage
      }

      ;(commsSystem as any).handleMessage(mockSocket, 'room-1', message)

      const expectedPreview = longMessage.substring(0, 50) + '...'
      expect(consoleSpy).toHaveBeenCalledWith(
        `Chat message from ${studentUser.username} in room room-1: ${expectedPreview}`
      )

      consoleSpy.mockRestore()
    })

    it('should not truncate messages exactly 50 characters', () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      const exactMessage = 'A'.repeat(50)
      const message = {
        userId: studentUser.id,
        username: studentUser.username,
        content: exactMessage
      }

      ;(commsSystem as any).handleMessage(mockSocket, 'room-1', message)

      expect(consoleSpy).toHaveBeenCalledWith(
        `Chat message from ${studentUser.username} in room room-1: ${exactMessage}`
      )

      consoleSpy.mockRestore()
    })
  })

  describe('Lecture lifecycle integration', () => {
    it('should handle full lecture lifecycle', () => {
      const lectureId = 'lecture-1'
      const roomId = 'room-1'

      // 1. Lecture starts - register as active
      commsSystem.registerLecture(lectureId, roomId, 'in-progress')
      expect(commsSystem.isRoomAvailable(roomId)).toBe(true)

      // 2. Lecture is in progress - room still available
      commsSystem.updateLectureStatus(lectureId, 'in-progress')
      expect(commsSystem.isRoomAvailable(roomId)).toBe(true)

      // 3. Lecture ends - update to completed
      commsSystem.updateLectureStatus(lectureId, 'completed')
      expect(commsSystem.isRoomAvailable(roomId)).toBe(false)

      // 4. Unregister lecture
      commsSystem.unregisterLecture(lectureId)
      expect(commsSystem.isRoomAvailable(roomId)).toBe(false)

      // Verify maps are clean
      const roomLectureMap = (commsSystem as any).roomLectureMap
      const lectureLookup = (commsSystem as any).lectureLookup
      expect(roomLectureMap.has(roomId)).toBe(false)
      expect(lectureLookup.has(lectureId)).toBe(false)
    })

    it('should handle cancelled lecture lifecycle', () => {
      const lectureId = 'lecture-2'
      const roomId = 'room-2'

      commsSystem.registerLecture(lectureId, roomId, 'active')
      expect(commsSystem.isRoomAvailable(roomId)).toBe(true)

      // Cancel lecture
      commsSystem.updateLectureStatus(lectureId, 'cancelled')
      expect(commsSystem.isRoomAvailable(roomId)).toBe(false)

      commsSystem.unregisterLecture(lectureId)
      expect(commsSystem.isRoomAvailable(roomId)).toBe(false)
    })

    it('should prevent entry after lecture completes mid-session', () => {
      const lectureId = 'lecture-3'
      const roomId = 'room-3'

      // Lecture is active - students can join
      commsSystem.registerLecture(lectureId, roomId, 'active')
      ;(commsSystem as any).handleJoinRoom(mockSocket, roomId, studentUser)
      expect(mockSocket.join).toHaveBeenCalledWith(roomId)

      // Reset mock
      mockSocket.join.mockClear()
      mockSocket.emit.mockClear()

      // Lecture ends
      commsSystem.updateLectureStatus(lectureId, 'completed')

      // New student tries to join - should be denied
      const newMockSocket = {
        ...mockSocket,
        id: 'new-socket-456'
      }
      ;(commsSystem as any).handleJoinRoom(newMockSocket, roomId, {
        id: 'student-2',
        username: 'latestudent@example.com',
        role: 'student',
        status: 'online'
      })

      expect(newMockSocket.join).not.toHaveBeenCalled()
      expect(newMockSocket.emit).toHaveBeenCalledWith(
        'join_room_error',
        expect.objectContaining({
          code: 'ROOM_UNAVAILABLE',
          message: 'This lecture has ended'
        })
      )
    })
  })

  describe('Multiple lectures and rooms', () => {
    it('should handle multiple active lectures simultaneously', () => {
      commsSystem.registerLecture('lecture-1', 'room-1', 'active')
      commsSystem.registerLecture('lecture-2', 'room-2', 'in-progress')
      commsSystem.registerLecture('lecture-3', 'room-3', 'completed')

      expect(commsSystem.isRoomAvailable('room-1')).toBe(true)
      expect(commsSystem.isRoomAvailable('room-2')).toBe(true)
      expect(commsSystem.isRoomAvailable('room-3')).toBe(false)
    })

    it('should handle status changes independently', () => {
      commsSystem.registerLecture('lecture-1', 'room-1', 'active')
      commsSystem.registerLecture('lecture-2', 'room-2', 'active')

      // End lecture-1
      commsSystem.updateLectureStatus('lecture-1', 'completed')

      expect(commsSystem.isRoomAvailable('room-1')).toBe(false)
      expect(commsSystem.isRoomAvailable('room-2')).toBe(true)
    })

    it('should clean up lectures independently', () => {
      commsSystem.registerLecture('lecture-1', 'room-1', 'active')
      commsSystem.registerLecture('lecture-2', 'room-2', 'active')

      commsSystem.unregisterLecture('lecture-1')

      const roomLectureMap = (commsSystem as any).roomLectureMap
      const lectureLookup = (commsSystem as any).lectureLookup

      expect(roomLectureMap.has('room-1')).toBe(false)
      expect(lectureLookup.has('lecture-1')).toBe(false)
      expect(roomLectureMap.has('room-2')).toBe(true)
      expect(lectureLookup.has('lecture-2')).toBe(true)
    })
  })
})
