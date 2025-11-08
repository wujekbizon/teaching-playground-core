/**
 * v1.3.1: Server-Side Participant Controls Tests
 * Tests for RealTimeCommunicationSystem participant management methods
 */

import { RealTimeCommunicationSystem } from '../systems/comms/RealTimeCommunicationSystem'
import { SystemError } from '../interfaces/errors.interface'
import { User } from '../interfaces/user.interface'
import { Server as SocketIOServer } from 'socket.io'
import { createServer } from 'http'

describe('RealTimeCommunicationSystem - Participant Controls (v1.3.1)', () => {
  let commsSystem: RealTimeCommunicationSystem
  let httpServer: any
  let io: SocketIOServer

  const teacherUser: User = {
    id: 'teacher-1',
    username: 'teacher',
    role: 'teacher',
    status: 'online'
  }

  const studentUser: User = {
    id: 'student-1',
    username: 'student',
    role: 'student',
    status: 'online'
  }

  const adminUser: User = {
    id: 'admin-1',
    username: 'admin',
    role: 'admin',
    status: 'online'
  }

  beforeEach(() => {
    // Create HTTP server and Socket.IO instance
    httpServer = createServer()
    io = new SocketIOServer(httpServer)

    commsSystem = new RealTimeCommunicationSystem()
    ;(commsSystem as any).io = io

    // Mock room participants
    const teacherParticipant = {
      id: teacherUser.id,
      username: teacherUser.username,
      role: teacherUser.role,
      status: teacherUser.status,
      socketId: 'teacher-socket-id',
      joinedAt: new Date().toISOString(),
      canStream: true,
      canChat: true,
      canScreenShare: true,
      isStreaming: false,
      handRaised: false
    }

    const studentParticipant = {
      id: studentUser.id,
      username: studentUser.username,
      role: studentUser.role,
      status: studentUser.status,
      socketId: 'student-socket-id',
      joinedAt: new Date().toISOString(),
      canStream: false,
      canChat: true,
      canScreenShare: false,
      isStreaming: false,
      handRaised: false
    }

    // Add participants to room
    const participants = new Map()
    participants.set(teacherParticipant.socketId, teacherParticipant)
    participants.set(studentParticipant.socketId, studentParticipant)

    // Set up room in commsSystem (access private field for testing)
    ;(commsSystem as any).rooms.set('room-1', participants)
  })

  afterEach(() => {
    jest.clearAllMocks()
    if (httpServer) {
      httpServer.close()
    }
  })

  describe('muteAllParticipants', () => {
    it('should emit mute_all event to all participants when teacher requests', () => {
      const emitSpy = jest.fn()
      const toSpy = jest.spyOn(io, 'to').mockReturnValue({ emit: emitSpy } as any)

      commsSystem.muteAllParticipants('room-1', 'teacher-1')

      expect(toSpy).toHaveBeenCalledWith('room-1')
      expect(emitSpy).toHaveBeenCalledWith('mute_all', {
        requestedBy: 'teacher-1',
        timestamp: expect.any(String)
      })
    })

    it('should throw error when requester is not teacher/admin', () => {
      expect(() => {
        commsSystem.muteAllParticipants('room-1', 'student-1')
      }).toThrow(SystemError)

      expect(() => {
        commsSystem.muteAllParticipants('room-1', 'student-1')
      }).toThrow('Only teachers can mute all participants')
    })

    it('should throw error when room does not exist', () => {
      expect(() => {
        commsSystem.muteAllParticipants('non-existent-room', 'teacher-1')
      }).toThrow(SystemError)

      expect(() => {
        commsSystem.muteAllParticipants('non-existent-room', 'teacher-1')
      }).toThrow('Room non-existent-room not found')
    })

    it('should allow admin to mute all participants', () => {
      // Add admin to room
      const participants = (commsSystem as any).rooms.get('room-1')
      participants.set('admin-socket-id', {
        id: adminUser.id,
        username: adminUser.username,
        role: adminUser.role,
        status: adminUser.status,
        socketId: 'admin-socket-id',
        joinedAt: new Date().toISOString(),
        canStream: true,
        canChat: true,
        canScreenShare: true,
        isStreaming: false,
        handRaised: false
      })

      expect(() => {
        commsSystem.muteAllParticipants('room-1', 'admin-1')
      }).not.toThrow()
    })
  })

  describe('muteParticipant', () => {
    it('should emit muted_by_teacher event to specific participant', () => {
      const emitSpy = jest.fn()
      const toSpy = jest.spyOn(io, 'to').mockReturnValue({ emit: emitSpy } as any)

      commsSystem.muteParticipant('room-1', 'student-1', 'teacher-1')

      expect(toSpy).toHaveBeenCalledWith('student-socket-id')
      expect(emitSpy).toHaveBeenCalledWith('muted_by_teacher', {
        requestedBy: 'teacher-1',
        reason: 'Muted by instructor',
        timestamp: expect.any(String)
      })
    })

    it('should throw error when requester is not teacher/admin', () => {
      expect(() => {
        commsSystem.muteParticipant('room-1', 'teacher-1', 'student-1')
      }).toThrow(SystemError)

      expect(() => {
        commsSystem.muteParticipant('room-1', 'teacher-1', 'student-1')
      }).toThrow('Only teachers can mute participants')
    })

    it('should throw error when target participant not found', () => {
      expect(() => {
        commsSystem.muteParticipant('room-1', 'non-existent-user', 'teacher-1')
      }).toThrow(SystemError)

      expect(() => {
        commsSystem.muteParticipant('room-1', 'non-existent-user', 'teacher-1')
      }).toThrow('Participant non-existent-user not found')
    })
  })

  describe('kickParticipant', () => {
    it('should emit kicked_from_room event to target and notify room', () => {
      const emitSpy = jest.fn()
      const toSpy = jest.spyOn(io, 'to').mockReturnValue({ emit: emitSpy } as any)

      commsSystem.kickParticipant('room-1', 'student-1', 'teacher-1', 'Disruptive behavior')

      // Should emit to specific student
      expect(toSpy).toHaveBeenCalledWith('student-socket-id')
      expect(emitSpy).toHaveBeenCalledWith('kicked_from_room', {
        roomId: 'room-1',
        reason: 'Disruptive behavior',
        kickedBy: 'teacher-1',
        timestamp: expect.any(String)
      })

      // Should also notify room
      expect(toSpy).toHaveBeenCalledWith('room-1')
      expect(emitSpy).toHaveBeenCalledWith('participant_kicked', {
        userId: 'student-1',
        reason: 'Disruptive behavior'
      })
    })

    it('should use default reason if not provided', () => {
      const emitSpy = jest.fn()
      jest.spyOn(io, 'to').mockReturnValue({ emit: emitSpy } as any)

      commsSystem.kickParticipant('room-1', 'student-1', 'teacher-1')

      expect(emitSpy).toHaveBeenCalledWith('kicked_from_room', {
        roomId: 'room-1',
        reason: 'Removed by instructor',
        kickedBy: 'teacher-1',
        timestamp: expect.any(String)
      })
    })

    it('should remove participant from room after kicking', () => {
      const participants = (commsSystem as any).rooms.get('room-1')
      expect(participants.size).toBe(2)

      commsSystem.kickParticipant('room-1', 'student-1', 'teacher-1')

      expect(participants.size).toBe(1)
      expect(participants.has('student-socket-id')).toBe(false)
    })

    it('should throw error when requester is not teacher/admin', () => {
      expect(() => {
        commsSystem.kickParticipant('room-1', 'teacher-1', 'student-1')
      }).toThrow(SystemError)
    })

    it('should throw error when target participant not found', () => {
      expect(() => {
        commsSystem.kickParticipant('room-1', 'non-existent-user', 'teacher-1')
      }).toThrow(SystemError)
    })
  })

  describe('raiseHand', () => {
    it('should update participant state and broadcast to room', () => {
      const emitSpy = jest.fn()
      const toSpy = jest.spyOn(io, 'to').mockReturnValue({ emit: emitSpy } as any)

      commsSystem.raiseHand('room-1', 'student-1')

      const participants = (commsSystem as any).rooms.get('room-1')
      const student: any = Array.from(participants.values()).find((p: any) => p.id === 'student-1')

      expect(student.handRaised).toBe(true)
      expect(student.handRaisedAt).toBeDefined()

      expect(toSpy).toHaveBeenCalledWith('room-1')
      expect(emitSpy).toHaveBeenCalledWith('hand_raised', {
        userId: 'student-1',
        username: 'student',
        timestamp: expect.any(String)
      })
    })

    it('should throw error when room not found', () => {
      expect(() => {
        commsSystem.raiseHand('non-existent-room', 'student-1')
      }).toThrow(SystemError)
    })

    it('should throw error when participant not found', () => {
      expect(() => {
        commsSystem.raiseHand('room-1', 'non-existent-user')
      }).toThrow(SystemError)
    })

    it('should allow teacher to raise hand', () => {
      expect(() => {
        commsSystem.raiseHand('room-1', 'teacher-1')
      }).not.toThrow()
    })
  })

  describe('lowerHand', () => {
    it('should update participant state and broadcast to room', () => {
      // First raise hand
      commsSystem.raiseHand('room-1', 'student-1')

      // Then lower it
      const emitSpy = jest.fn()
      const toSpy = jest.spyOn(io, 'to').mockReturnValue({ emit: emitSpy } as any)

      commsSystem.lowerHand('room-1', 'student-1')

      const participants = (commsSystem as any).rooms.get('room-1')
      const student: any = Array.from(participants.values()).find((p: any) => p.id === 'student-1')

      expect(student.handRaised).toBe(false)
      expect(student.handRaisedAt).toBeUndefined()

      expect(toSpy).toHaveBeenCalledWith('room-1')
      expect(emitSpy).toHaveBeenCalledWith('hand_lowered', {
        userId: 'student-1',
        timestamp: expect.any(String)
      })
    })

    it('should throw error when room not found', () => {
      expect(() => {
        commsSystem.lowerHand('non-existent-room', 'student-1')
      }).toThrow(SystemError)
    })

    it('should throw error when participant not found', () => {
      expect(() => {
        commsSystem.lowerHand('room-1', 'non-existent-user')
      }).toThrow(SystemError)
    })
  })

  describe('Permission checks', () => {
    it('should verify only teacher/admin can mute all', () => {
      expect(() => commsSystem.muteAllParticipants('room-1', 'teacher-1')).not.toThrow()
      expect(() => commsSystem.muteAllParticipants('room-1', 'student-1')).toThrow()
    })

    it('should verify only teacher/admin can mute individual', () => {
      expect(() => commsSystem.muteParticipant('room-1', 'student-1', 'teacher-1')).not.toThrow()
      expect(() => commsSystem.muteParticipant('room-1', 'teacher-1', 'student-1')).toThrow()
    })

    it('should verify only teacher/admin can kick', () => {
      expect(() => commsSystem.kickParticipant('room-1', 'student-1', 'teacher-1')).not.toThrow()
      expect(() => commsSystem.kickParticipant('room-1', 'teacher-1', 'student-1')).toThrow()
    })

    it('should verify anyone can raise/lower hand', () => {
      expect(() => commsSystem.raiseHand('room-1', 'student-1')).not.toThrow()
      expect(() => commsSystem.raiseHand('room-1', 'teacher-1')).not.toThrow()
      expect(() => commsSystem.lowerHand('room-1', 'student-1')).not.toThrow()
      expect(() => commsSystem.lowerHand('room-1', 'teacher-1')).not.toThrow()
    })
  })
})
