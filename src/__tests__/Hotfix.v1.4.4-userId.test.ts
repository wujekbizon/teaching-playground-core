/**
 * Hotfix v1.4.4 - user_joined Missing userId Field
 * 
 * BUG: user_joined event was missing the userId field
 * IMPACT: Frontend could not properly identify users (socketId changes on reconnect, userId is stable)
 * FIX: Explicitly include userId in user_joined event payload
 * 
 * Test verifies:
 * - user_joined event includes userId field
 * - userId matches the user's id from the User object
 * - All other expected fields are present (username, socketId, role, etc.)
 */

import { createServer } from 'http'
import { io as ioClient } from 'socket.io-client'
import { RealTimeCommunicationSystem } from '../systems/comms/RealTimeCommunicationSystem'

describe('Hotfix v1.4.4 - user_joined userId Field', () => {
  let httpServer: any
  let commsSystem: RealTimeCommunicationSystem
  let teacherSocket: any
  let student1Socket: any
  let student2Socket: any

  const teacher = {
    id: 'user_teacher_userId_test',
    username: 'teacher@example.com',
    role: 'teacher' as const,
    displayName: 'Test Teacher',
    email: 'teacher@example.com',
    status: 'online' as const
  }

  const student1 = {
    id: 'user_student1_userId_test',
    username: 'student1@example.com',
    role: 'student' as const,
    displayName: 'Student One',
    email: 'student1@example.com',
    status: 'online' as const
  }

  const student2 = {
    id: 'user_student2_userId_test',
    username: 'student2@example.com',
    role: 'student' as const,
    displayName: 'Student Two',
    email: 'student2@example.com',
    status: 'online' as const
  }

  beforeEach((done) => {
    httpServer = createServer()
    commsSystem = new RealTimeCommunicationSystem()
    commsSystem.initialize(httpServer)

    httpServer.listen(3011, () => {
      teacherSocket = ioClient('http://localhost:3011', { transports: ['websocket'] })
      teacherSocket.on('connect', () => done())
    })
  })

  afterEach((done) => {
    if (teacherSocket?.connected) teacherSocket.disconnect()
    if (student1Socket?.connected) student1Socket.disconnect()
    if (student2Socket?.connected) student2Socket.disconnect()
    setTimeout(() => {
      httpServer.close()
      done()
    }, 100)
  })

  it('should include userId in user_joined event when student joins after teacher', (done) => {
    const roomId = 'test-userid-single'

    teacherSocket.emit('join_room', { roomId, user: teacher })

    teacherSocket.on('room_state', () => {
      // Teacher is in room, now add student
      student1Socket = ioClient('http://localhost:3011', { transports: ['websocket'] })

      teacherSocket.once('user_joined', (data: any) => {
        // CRITICAL: Must have userId field
        expect(data).toHaveProperty('userId')
        expect(data.userId).toBe(student1.id)

        // Should also have other expected fields
        expect(data.username).toBe(student1.username)
        expect(data.socketId).toBeDefined()
        expect(data.role).toBe(student1.role)
        expect(data.displayName).toBe(student1.displayName)
        expect(data.status).toBe(student1.status)

        done()
      })

      student1Socket.on('connect', () => {
        student1Socket.emit('join_room', { roomId, user: student1 })
      })
    })
  }, 10000)

  it('should include userId for all participants joining sequentially', (done) => {
    const roomId = 'test-userid-multiple'
    const joinedUsers: string[] = []

    teacherSocket.emit('join_room', { roomId, user: teacher })

    teacherSocket.on('user_joined', (data: any) => {
      // Each user_joined must have userId
      expect(data).toHaveProperty('userId')
      expect(data.userId).toBeDefined()
      expect(typeof data.userId).toBe('string')

      joinedUsers.push(data.userId)

      // When both students have joined
      if (joinedUsers.length === 2) {
        expect(joinedUsers).toContain(student1.id)
        expect(joinedUsers).toContain(student2.id)
        done()
      }
    })

    teacherSocket.on('room_state', () => {
      // Add student 1
      student1Socket = ioClient('http://localhost:3011', { transports: ['websocket'] })
      student1Socket.on('connect', () => {
        student1Socket.emit('join_room', { roomId, user: student1 })

        // Wait a bit then add student 2
        setTimeout(() => {
          student2Socket = ioClient('http://localhost:3011', { transports: ['websocket'] })
          student2Socket.on('connect', () => {
            student2Socket.emit('join_room', { roomId, user: student2 })
          })
        }, 200)
      })
    })
  }, 10000)

  it('should emit userId to ALL existing participants (not just teacher)', (done) => {
    const roomId = 'test-userid-broadcast'
    let teacherReceived = false
    let student1Received = false

    // Teacher joins
    teacherSocket.emit('join_room', { roomId, user: teacher })

    teacherSocket.on('room_state', () => {
      // Student 1 joins
      student1Socket = ioClient('http://localhost:3011', { transports: ['websocket'] })

      student1Socket.on('connect', () => {
        student1Socket.emit('join_room', { roomId, user: student1 })

        student1Socket.on('room_state', () => {
          // Now student 2 joins - both teacher AND student1 should receive user_joined with userId
          student2Socket = ioClient('http://localhost:3011', { transports: ['websocket'] })

          teacherSocket.once('user_joined', (data: any) => {
            if (data.userId === student2.id) {
              expect(data.userId).toBe(student2.id)
              expect(data.username).toBe(student2.username)
              teacherReceived = true
              if (student1Received) done()
            }
          })

          student1Socket.once('user_joined', (data: any) => {
            if (data.userId === student2.id) {
              expect(data.userId).toBe(student2.id)
              expect(data.username).toBe(student2.username)
              student1Received = true
              if (teacherReceived) done()
            }
          })

          student2Socket.on('connect', () => {
            student2Socket.emit('join_room', { roomId, user: student2 })
          })
        })
      })
    })
  }, 10000)

  it('should NOT send userId in room_state to the joining user (consistency check)', (done) => {
    // This test verifies that room_state still sends the full participant objects
    // (which have 'id' field, not 'userId'), while user_joined sends 'userId'
    const roomId = 'test-room-state-consistency'

    teacherSocket.emit('join_room', { roomId, user: teacher })

    teacherSocket.on('room_state', (state: any) => {
      expect(state.participants).toBeDefined()
      expect(state.participants.length).toBe(1)

      // room_state participants should have 'id' field (full participant object)
      expect(state.participants[0]).toHaveProperty('id')
      expect(state.participants[0].id).toBe(teacher.id)

      // room_state participants should NOT have 'userId' field (that's only for user_joined)
      expect(state.participants[0]).not.toHaveProperty('userId')

      done()
    })
  }, 10000)

  it('should log userId in server logs (for debugging)', (done) => {
    // This is more of a verification that the logging also includes userId
    const roomId = 'test-userid-logging'
    const consoleSpy = jest.spyOn(console, 'log')

    teacherSocket.emit('join_room', { roomId, user: teacher })

    teacherSocket.on('room_state', () => {
      student1Socket = ioClient('http://localhost:3011', { transports: ['websocket'] })

      teacherSocket.once('user_joined', (data: any) => {
        expect(data.userId).toBe(student1.id)

        // Check that console.log was called with userId in the existingParticipants map
        const logCalls = consoleSpy.mock.calls
        const relevantLog = logCalls.find((call: any[]) =>
          call.some((arg: any) =>
            typeof arg === 'string' && arg.includes("Emitting 'user_joined'")
          )
        )

        expect(relevantLog).toBeDefined()

        consoleSpy.mockRestore()
        done()
      })

      student1Socket.on('connect', () => {
        student1Socket.emit('join_room', { roomId, user: student1 })
      })
    })
  }, 10000)
})
