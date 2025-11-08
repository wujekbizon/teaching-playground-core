/**
 * v1.3.1: Participant Controls Tests
 * Tests for teacher classroom management features:
 * - Mute all participants
 * - Mute individual participant
 * - Kick participant
 * - Hand raise/lower
 */

import { RoomConnection } from '../services/RoomConnection'
import { User } from '../interfaces/user.interface'
import { SystemError } from '../interfaces/errors.interface'

// Mock socket.io-client
jest.mock('socket.io-client')

describe('RoomConnection - Participant Controls (v1.3.1)', () => {
  let connection: RoomConnection
  let teacherUser: User
  let studentUser: User
  let mockSocket: any

  beforeEach(() => {
    // Teacher user
    teacherUser = {
      id: 'teacher-1',
      username: 'teacher',
      role: 'teacher',
      status: 'online'
    }

    // Student user
    studentUser = {
      id: 'student-1',
      username: 'student',
      role: 'student',
      status: 'online'
    }

    // Mock socket
    mockSocket = {
      on: jest.fn(),
      emit: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      removeAllListeners: jest.fn(),
      id: 'socket-123'
    }

    // Mock io function
    const { io } = require('socket.io-client')
    io.mockReturnValue(mockSocket)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('muteAllParticipants', () => {
    it('should emit mute_all_participants event when teacher calls it', () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      // Simulate connection
      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      // Call muteAllParticipants
      connection.muteAllParticipants()

      // Verify socket emitted correct event
      expect(mockSocket.emit).toHaveBeenCalledWith('mute_all_participants', {
        roomId: 'room-1',
        requesterId: 'teacher-1'
      })
    })

    it('should throw error when student tries to mute all', () => {
      connection = new RoomConnection('room-1', studentUser, 'ws://localhost:3001')
      connection.connect()

      // Simulate connection
      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      // Should throw permission error
      expect(() => connection.muteAllParticipants()).toThrow(SystemError)
      expect(() => connection.muteAllParticipants()).toThrow('Only teachers/admins can mute all participants')
    })

    it('should throw error when not connected', () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')

      // Don't connect, just try to mute
      expect(() => connection.muteAllParticipants()).toThrow(SystemError)
      expect(() => connection.muteAllParticipants()).toThrow('Cannot mute participants: not connected')
    })

    it('should emit mute_all event to frontend when received', () => {
      connection = new RoomConnection('room-1', studentUser, 'ws://localhost:3001')
      connection.connect()

      // Get the mute_all listener
      const muteAllHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'mute_all')[1]

      // Set up event listener
      const eventSpy = jest.fn()
      connection.on('mute_all', eventSpy)

      // Simulate receiving mute_all event
      muteAllHandler({
        requestedBy: 'teacher-1',
        timestamp: new Date().toISOString()
      })

      // Verify event was emitted to frontend
      expect(eventSpy).toHaveBeenCalledWith({
        requestedBy: 'teacher-1',
        timestamp: expect.any(String)
      })
    })
  })

  describe('muteParticipant', () => {
    it('should emit mute_participant event when teacher mutes specific student', () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      // Simulate connection
      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      // Mute specific participant
      connection.muteParticipant('student-1')

      expect(mockSocket.emit).toHaveBeenCalledWith('mute_participant', {
        roomId: 'room-1',
        targetUserId: 'student-1',
        requesterId: 'teacher-1'
      })
    })

    it('should throw error when student tries to mute another student', () => {
      connection = new RoomConnection('room-1', studentUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      expect(() => connection.muteParticipant('student-2')).toThrow(SystemError)
      expect(() => connection.muteParticipant('student-2')).toThrow('Only teachers/admins can mute participants')
    })

    it('should emit muted_by_teacher event when student is muted', () => {
      connection = new RoomConnection('room-1', studentUser, 'ws://localhost:3001')
      connection.connect()

      const mutedHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'muted_by_teacher')[1]

      const eventSpy = jest.fn()
      connection.on('muted_by_teacher', eventSpy)

      mutedHandler({
        requestedBy: 'teacher-1',
        reason: 'Muted by instructor',
        timestamp: new Date().toISOString()
      })

      expect(eventSpy).toHaveBeenCalledWith({
        requestedBy: 'teacher-1',
        reason: 'Muted by instructor',
        timestamp: expect.any(String)
      })
    })
  })

  describe('kickParticipant', () => {
    it('should emit kick_participant event with reason', () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      connection.kickParticipant('student-1', 'Disruptive behavior')

      expect(mockSocket.emit).toHaveBeenCalledWith('kick_participant', {
        roomId: 'room-1',
        targetUserId: 'student-1',
        requesterId: 'teacher-1',
        reason: 'Disruptive behavior'
      })
    })

    it('should emit kick_participant event without reason', () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      connection.kickParticipant('student-1')

      expect(mockSocket.emit).toHaveBeenCalledWith('kick_participant', {
        roomId: 'room-1',
        targetUserId: 'student-1',
        requesterId: 'teacher-1',
        reason: undefined
      })
    })

    it('should throw error when student tries to kick', () => {
      connection = new RoomConnection('room-1', studentUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      expect(() => connection.kickParticipant('student-2')).toThrow(SystemError)
      expect(() => connection.kickParticipant('student-2')).toThrow('Only teachers/admins can kick participants')
    })

    it('should disconnect when kicked_from_room event is received', () => {
      connection = new RoomConnection('room-1', studentUser, 'ws://localhost:3001')
      connection.connect()

      const kickedHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'kicked_from_room')[1]
      const disconnectSpy = jest.spyOn(connection, 'disconnect')

      kickedHandler({
        roomId: 'room-1',
        reason: 'Removed by instructor',
        kickedBy: 'teacher-1',
        timestamp: new Date().toISOString()
      })

      expect(disconnectSpy).toHaveBeenCalled()
    })

    it('should emit participant_kicked event when someone else is kicked', () => {
      connection = new RoomConnection('room-1', studentUser, 'ws://localhost:3001')
      connection.connect()

      const participantKickedHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'participant_kicked'
      )[1]

      const eventSpy = jest.fn()
      connection.on('participant_kicked', eventSpy)

      participantKickedHandler({
        userId: 'student-2',
        reason: 'Removed by instructor'
      })

      expect(eventSpy).toHaveBeenCalledWith({
        userId: 'student-2',
        reason: 'Removed by instructor'
      })
    })
  })

  describe('raiseHand', () => {
    it('should emit raise_hand event when student raises hand', () => {
      connection = new RoomConnection('room-1', studentUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      connection.raiseHand()

      expect(mockSocket.emit).toHaveBeenCalledWith('raise_hand', {
        roomId: 'room-1',
        userId: 'student-1'
      })
    })

    it('should allow teacher to raise hand', () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      connection.raiseHand()

      expect(mockSocket.emit).toHaveBeenCalledWith('raise_hand', {
        roomId: 'room-1',
        userId: 'teacher-1'
      })
    })

    it('should throw error when not connected', () => {
      connection = new RoomConnection('room-1', studentUser, 'ws://localhost:3001')

      expect(() => connection.raiseHand()).toThrow(SystemError)
      expect(() => connection.raiseHand()).toThrow('Cannot raise hand: not connected')
    })

    it('should emit hand_raised event when received from server', () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      const handRaisedHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'hand_raised')[1]

      const eventSpy = jest.fn()
      connection.on('hand_raised', eventSpy)

      handRaisedHandler({
        userId: 'student-1',
        username: 'student',
        timestamp: new Date().toISOString()
      })

      expect(eventSpy).toHaveBeenCalledWith({
        userId: 'student-1',
        username: 'student',
        timestamp: expect.any(String)
      })
    })
  })

  describe('lowerHand', () => {
    it('should emit lower_hand event when student lowers hand', () => {
      connection = new RoomConnection('room-1', studentUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      connection.lowerHand()

      expect(mockSocket.emit).toHaveBeenCalledWith('lower_hand', {
        roomId: 'room-1',
        userId: 'student-1'
      })
    })

    it('should throw error when not connected', () => {
      connection = new RoomConnection('room-1', studentUser, 'ws://localhost:3001')

      expect(() => connection.lowerHand()).toThrow(SystemError)
      expect(() => connection.lowerHand()).toThrow('Cannot lower hand: not connected')
    })

    it('should emit hand_lowered event when received from server', () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      const handLoweredHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'hand_lowered')[1]

      const eventSpy = jest.fn()
      connection.on('hand_lowered', eventSpy)

      handLoweredHandler({
        userId: 'student-1',
        timestamp: new Date().toISOString()
      })

      expect(eventSpy).toHaveBeenCalledWith({
        userId: 'student-1',
        timestamp: expect.any(String)
      })
    })
  })

  describe('Admin role', () => {
    it('should allow admin to mute all participants', () => {
      const adminUser: User = {
        id: 'admin-1',
        username: 'admin',
        role: 'admin',
        status: 'online'
      }

      connection = new RoomConnection('room-1', adminUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      expect(() => connection.muteAllParticipants()).not.toThrow()
    })

    it('should allow admin to mute individual participant', () => {
      const adminUser: User = {
        id: 'admin-1',
        username: 'admin',
        role: 'admin',
        status: 'online'
      }

      connection = new RoomConnection('room-1', adminUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      expect(() => connection.muteParticipant('student-1')).not.toThrow()
    })

    it('should allow admin to kick participant', () => {
      const adminUser: User = {
        id: 'admin-1',
        username: 'admin',
        role: 'admin',
        status: 'online'
      }

      connection = new RoomConnection('room-1', adminUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      expect(() => connection.kickParticipant('student-1', 'Test')).not.toThrow()
    })
  })
})
