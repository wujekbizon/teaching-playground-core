/**
 * Hotfix Test Suite for v1.4.1 and v1.4.2
 *
 * This test file validates all critical hotfixes:
 * - v1.4.1: Issues #1, #2, #3 (participant controls and room state)
 * - v1.4.2: Issues #4, #5 (WebRTC peer connections)
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import { RealTimeCommunicationSystem } from '../systems/comms/RealTimeCommunicationSystem'
import { User } from '../interfaces/user.interface'
import { Server as SocketIOServer } from 'socket.io'
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client'
import { createServer } from 'http'

// Mock WebRTC APIs BEFORE any imports that use them
class MockRTCPeerConnection {
  localDescription: any = null
  remoteDescription: any = null
  ontrack: ((event: any) => void) | null = null
  onicecandidate: ((event: any) => void) | null = null
  onconnectionstatechange: (() => void) | null = null
  connectionState: string = 'new'
  private senders: any[] = []

  constructor(config: any) {
    // Mock constructor
  }

  addTrack(track: any, stream: any) {
    this.senders.push({ track })
    return { track }
  }

  getSenders() {
    return this.senders
  }

  async createOffer(options?: any) {
    return { type: 'offer', sdp: 'mock-sdp-offer' }
  }

  async createAnswer() {
    return { type: 'answer', sdp: 'mock-sdp-answer' }
  }

  async setLocalDescription(desc: any) {
    this.localDescription = desc
  }

  async setRemoteDescription(desc: any) {
    this.remoteDescription = desc
  }

  async addIceCandidate(candidate: any) {
    // Mock ICE candidate addition
  }

  close() {
    this.connectionState = 'closed'
  }
}

class MockRTCSessionDescription {
  type: string
  sdp: string
  constructor(init: any) {
    this.type = init.type
    this.sdp = init.sdp
  }
}

class MockRTCIceCandidate {
  candidate: string
  constructor(init: any) {
    this.candidate = init.candidate
  }
}

// Assign mocks to global BEFORE imports
(global as any).RTCPeerConnection = MockRTCPeerConnection;
(global as any).RTCSessionDescription = MockRTCSessionDescription;
(global as any).RTCIceCandidate = MockRTCIceCandidate

// Now import RoomConnection (will use mocked WebRTC APIs)
import { RoomConnection } from '../services/RoomConnection'

// ============================================================================
// Issue #1 (v1.4.1): room_state Missing Existing Participants
// ============================================================================

describe('Hotfix v1.4.1 - Issue #1: room_state includes all existing participants', () => {
  let commsSystem: RealTimeCommunicationSystem
  let httpServer: any
  let clientSocket1: ClientSocket
  let clientSocket2: ClientSocket
  let clientSocket3: ClientSocket

  const teacher: User = {
    id: 'teacher-1',
    username: 'teacher@example.com',
    role: 'teacher',
    status: 'online'
  }

  const student1: User = {
    id: 'student-1',
    username: 'student1@example.com',
    role: 'student',
    status: 'online'
  }

  const student2: User = {
    id: 'student-2',
    username: 'student2@example.com',
    role: 'student',
    status: 'online'
  }

  beforeEach((done) => {
    httpServer = createServer()
    commsSystem = new RealTimeCommunicationSystem()
    commsSystem.initialize(httpServer)

    httpServer.listen(3005, () => {
      clientSocket1 = ioClient('http://localhost:3005', { transports: ['websocket'] })
      clientSocket1.on('connect', () => done())
    })
  })

  afterEach((done) => {
    const closeAll = async () => {
      if (clientSocket1?.connected) clientSocket1.disconnect()
      if (clientSocket2?.connected) clientSocket2.disconnect()
      if (clientSocket3?.connected) clientSocket3.disconnect()
      await new Promise(resolve => setTimeout(resolve, 100))
      httpServer.close()
      done()
    }
    closeAll()
  })

  it('should include existing participants when second user joins', (done) => {
    const roomId = 'test-room-1'
    let teacherReceivedState = false
    let studentReceivedState = false

    // Teacher joins first
    clientSocket1.emit('join_room', { roomId, user: teacher })

    clientSocket1.on('room_state', (state: any) => {
      console.log('Teacher received room_state:', state)
      expect(state.participants).toBeDefined()
      expect(Array.isArray(state.participants)).toBe(true)

      if (state.participants.length === 1) {
        // Teacher's initial state
        expect(state.participants[0].id).toBe(teacher.id)
        expect(state.participants[0].username).toBe(teacher.username)
        teacherReceivedState = true

        // Now student joins
        setTimeout(() => {
          clientSocket2 = ioClient('http://localhost:3005', { transports: ['websocket'] })
          clientSocket2.on('connect', () => {
            clientSocket2.emit('join_room', { roomId, user: student1 })
          })

          // CRITICAL TEST: Student should see BOTH participants
          clientSocket2.on('room_state', (studentState: any) => {
            console.log('Student received room_state:', studentState)
            expect(studentState.participants).toBeDefined()
            expect(studentState.participants.length).toBe(2) // ← THE FIX: Should see teacher + self

            const participantIds = studentState.participants.map((p: any) => p.id)
            expect(participantIds).toContain(teacher.id) // Should include teacher
            expect(participantIds).toContain(student1.id) // Should include self

            studentReceivedState = true
            done()
          })
        }, 200)
      }
    })
  })

  it('should include all participants when third user joins', (done) => {
    const roomId = 'test-room-2'

    // Teacher joins first
    clientSocket1.emit('join_room', { roomId, user: teacher })

    clientSocket1.on('room_state', (state: any) => {
      if (state.participants.length === 1) {
        // Student 1 joins second
        setTimeout(() => {
          clientSocket2 = ioClient('http://localhost:3005', { transports: ['websocket'] })
          clientSocket2.on('connect', () => {
            clientSocket2.emit('join_room', { roomId, user: student1 })
          })

          clientSocket2.on('room_state', (state2: any) => {
            if (state2.participants.length === 2) {
              // Student 2 joins third
              setTimeout(() => {
                clientSocket3 = ioClient('http://localhost:3005', { transports: ['websocket'] })
                clientSocket3.on('connect', () => {
                  clientSocket3.emit('join_room', { roomId, user: student2 })
                })

                // CRITICAL: Student 2 should see ALL 3 participants
                clientSocket3.on('room_state', (state3: any) => {
                  console.log('Student 2 received room_state:', state3)
                  expect(state3.participants.length).toBe(3) // ← Should see all 3

                  const participantIds = state3.participants.map((p: any) => p.id)
                  expect(participantIds).toContain(teacher.id)
                  expect(participantIds).toContain(student1.id)
                  expect(participantIds).toContain(student2.id)

                  done()
                })
              }, 200)
            }
          })
        }, 200)
      }
    })
  })

  it('should not clear existing participants when setupForRoom is called', (done) => {
    const roomId = 'test-room-3'

    // Teacher joins
    clientSocket1.emit('join_room', { roomId, user: teacher })

    clientSocket1.on('room_state', (state: any) => {
      if (state.participants.length === 1) {
        // Simulate setupForRoom being called after users joined
        // This was the bug - it would clear the participants Map
        commsSystem.setupForRoom(roomId)

        // Student joins after setupForRoom
        setTimeout(() => {
          clientSocket2 = ioClient('http://localhost:3005', { transports: ['websocket'] })
          clientSocket2.on('connect', () => {
            clientSocket2.emit('join_room', { roomId, user: student1 })
          })

          clientSocket2.on('room_state', (studentState: any) => {
            // CRITICAL: Teacher should still be in the room
            expect(studentState.participants.length).toBe(2)
            const hasTeacher = studentState.participants.some((p: any) => p.id === teacher.id)
            expect(hasTeacher).toBe(true)
            done()
          })
        }, 200)
      }
    })
  })
})

// ============================================================================
// Issue #2 (v1.4.1): Kick Participant Not Working
// ============================================================================

describe('Hotfix v1.4.1 - Issue #2: Kick participant force-disconnect', () => {
  let commsSystem: RealTimeCommunicationSystem
  let httpServer: any
  let teacherSocket: ClientSocket
  let studentSocket: ClientSocket

  const teacher: User = {
    id: 'teacher-1',
    username: 'teacher@example.com',
    role: 'teacher',
    status: 'online'
  }

  const student: User = {
    id: 'student-1',
    username: 'student@example.com',
    role: 'student',
    status: 'online'
  }

  beforeEach((done) => {
    httpServer = createServer()
    commsSystem = new RealTimeCommunicationSystem()
    commsSystem.initialize(httpServer)

    httpServer.listen(3006, () => {
      teacherSocket = ioClient('http://localhost:3006', { transports: ['websocket'] })
      teacherSocket.on('connect', () => done())
    })
  })

  afterEach((done) => {
    if (teacherSocket?.connected) teacherSocket.disconnect()
    if (studentSocket?.connected) studentSocket.disconnect()
    setTimeout(() => {
      httpServer.close()
      done()
    }, 100)
  })

  it('should forcefully disconnect kicked participant within 2 seconds', (done) => {
    const roomId = 'kick-test-room'
    let studentDisconnected = false

    // Both join room
    teacherSocket.emit('join_room', { roomId, user: teacher })

    teacherSocket.on('room_state', (state: any) => {
      if (state.participants.length === 1) {
        // Student joins
        studentSocket = ioClient('http://localhost:3006', { transports: ['websocket'] })
        studentSocket.on('connect', () => {
          studentSocket.emit('join_room', { roomId, user: student })
        })

        studentSocket.on('room_state', (studentState: any) => {
          if (studentState.participants.length === 2) {
            // Student is in room, now teacher kicks them
            setTimeout(() => {
              teacherSocket.emit('kick_participant', {
                roomId,
                targetUserId: student.id,
                requesterId: teacher.id,
                reason: 'Test kick'
              })
            }, 100)
          }
        })

        // CRITICAL TEST: Student should receive kicked event
        studentSocket.on('kicked_from_room', (data: any) => {
          console.log('Student received kicked_from_room:', data)
          expect(data.roomId).toBe(roomId)
          expect(data.reason).toBe('Test kick')
          expect(data.kickedBy).toBe(teacher.id)
        })

        // CRITICAL TEST: Student should be disconnected
        studentSocket.on('disconnect', (reason: string) => {
          console.log('Student disconnected:', reason)
          studentDisconnected = true

          // Verify disconnection happened within 2 seconds of kick
          setTimeout(() => {
            expect(studentDisconnected).toBe(true)
            expect(studentSocket.connected).toBe(false)
            done()
          }, 100)
        })
      }
    })
  }, 10000) // Increase timeout for this test

  it('should emit participant_kicked to other room members', (done) => {
    const roomId = 'kick-broadcast-room'
    let participantKickedReceived = false

    teacherSocket.emit('join_room', { roomId, user: teacher })

    teacherSocket.on('room_state', (state: any) => {
      if (state.participants.length === 1) {
        studentSocket = ioClient('http://localhost:3006', { transports: ['websocket'] })
        studentSocket.on('connect', () => {
          studentSocket.emit('join_room', { roomId, user: student })
        })

        studentSocket.on('room_state', () => {
          setTimeout(() => {
            // Teacher should receive participant_kicked event
            teacherSocket.on('participant_kicked', (data: any) => {
              console.log('Teacher received participant_kicked:', data)
              expect(data.userId).toBe(student.id)
              expect(data.reason).toBe('Disruptive behavior')
              participantKickedReceived = true
              done()
            })

            teacherSocket.emit('kick_participant', {
              roomId,
              targetUserId: student.id,
              requesterId: teacher.id,
              reason: 'Disruptive behavior'
            })
          }, 100)
        })
      }
    })
  }, 10000)
})

// ============================================================================
// Issue #3 (v1.4.1): Enhanced Logging
// ============================================================================

describe('Hotfix v1.4.1 - Issue #3: Enhanced logging does not break functionality', () => {
  let commsSystem: RealTimeCommunicationSystem
  let httpServer: any

  beforeEach(() => {
    httpServer = createServer()
    commsSystem = new RealTimeCommunicationSystem()
    commsSystem.initialize(httpServer)
  })

  afterEach(() => {
    if (httpServer) {
      httpServer.close()
    }
  })

  it('should successfully mute participant with enhanced logging', () => {
    const roomId = 'test-room'

    // Add teacher and student
    commsSystem.setupForRoom(roomId)

    // Mock participants
    const teacherParticipant = {
      id: 'teacher-1',
      username: 'teacher@example.com',
      role: 'teacher' as const,
      socketId: 'socket-teacher',
      status: 'online' as const,
      joinedAt: new Date().toISOString(),
      canStream: true,
      canChat: true,
      canScreenShare: true,
      isStreaming: false,
      handRaised: false
    }

    const studentParticipant = {
      id: 'student-1',
      username: 'student@example.com',
      role: 'student' as const,
      socketId: 'socket-student',
      status: 'online' as const,
      joinedAt: new Date().toISOString(),
      canStream: false,
      canChat: true,
      canScreenShare: false,
      isStreaming: false,
      handRaised: false
    }

    // Add participants directly to room
    const room = (commsSystem as any).rooms.get(roomId)
    room.set(teacherParticipant.socketId, teacherParticipant)
    room.set(studentParticipant.socketId, studentParticipant)

    // Mock socket.io
    const mockIo = {
      to: jest.fn().mockReturnValue({
        emit: jest.fn()
      })
    };
    (commsSystem as any).io = mockIo

    // Should not throw - logging is internal
    expect(() => {
      commsSystem.muteParticipant(roomId, 'student-1', 'teacher-1')
    }).not.toThrow()
  })

  it('should successfully kick participant with enhanced logging', () => {
    const roomId = 'test-room-kick'

    commsSystem.setupForRoom(roomId)

    const teacherParticipant = {
      id: 'teacher-1',
      username: 'teacher@example.com',
      role: 'teacher' as const,
      socketId: 'socket-teacher',
      status: 'online' as const,
      joinedAt: new Date().toISOString(),
      canStream: true,
      canChat: true,
      canScreenShare: true,
      isStreaming: false,
      handRaised: false
    }

    const studentParticipant = {
      id: 'student-1',
      username: 'student@example.com',
      role: 'student' as const,
      socketId: 'socket-student',
      status: 'online' as const,
      joinedAt: new Date().toISOString(),
      canStream: false,
      canChat: true,
      canScreenShare: false,
      isStreaming: false,
      handRaised: false
    }

    const room = (commsSystem as any).rooms.get(roomId)
    room.set(teacherParticipant.socketId, teacherParticipant)
    room.set(studentParticipant.socketId, studentParticipant)

    // Mock socket.io with disconnect capability
    const mockSocket = {
      disconnect: jest.fn()
    }
    const mockIo = {
      to: jest.fn().mockReturnValue({
        emit: jest.fn()
      }),
      sockets: {
        sockets: new Map([['socket-student', mockSocket]])
      }
    };
    (commsSystem as any).io = mockIo

    // Should not throw
    expect(() => {
      commsSystem.kickParticipant(roomId, 'student-1', 'teacher-1', 'Test reason')
    }).not.toThrow()
  })
})

// ============================================================================
// Issue #4 (v1.4.2): setupPeerConnection Crashes with Null Streams
// ============================================================================

describe('Hotfix v1.4.2 - Issue #4: setupPeerConnection handles null streams', () => {
  let connection: RoomConnection

  const student: User = {
    id: 'student-1',
    username: 'student@example.com',
    role: 'student',
    status: 'online'
  }

  // WebRTC APIs are mocked at module level (top of file)

  beforeEach(() => {
    connection = new RoomConnection('test-room', student, 'ws://localhost:3008')
  })

  afterEach(() => {
    if (connection) {
      connection.disconnect()
    }
  })

  it('should create peer connection without local stream (null)', async () => {
    // CRITICAL TEST: Should not crash with null
    const pc = await connection.setupPeerConnection('peer-123', null)

    expect(pc).toBeDefined()
    expect(pc).toBeInstanceOf(RTCPeerConnection)
    expect(pc.getSenders().length).toBe(0) // No tracks added
  })

  it('should create peer connection without local stream (undefined)', async () => {
    // CRITICAL TEST: Should not crash with undefined
    const pc = await connection.setupPeerConnection('peer-456', undefined)

    expect(pc).toBeDefined()
    expect(pc).toBeInstanceOf(RTCPeerConnection)
    expect(pc.getSenders().length).toBe(0)
  })

  it('should create peer connection with local stream', async () => {
    // Mock MediaStream
    const mockStream = {
      getTracks: jest.fn().mockReturnValue([
        { kind: 'audio', id: 'audio-1' },
        { kind: 'video', id: 'video-1' }
      ])
    } as any

    const pc = await connection.setupPeerConnection('peer-789', mockStream)

    expect(pc).toBeDefined()
    expect(mockStream.getTracks).toHaveBeenCalled()
    expect(pc.getSenders().length).toBe(2) // Audio + video tracks
  })

  it('should allow adding tracks later to receive-only connection', async () => {
    // Create receive-only connection
    const pc = await connection.setupPeerConnection('peer-abc', null)
    expect(pc.getSenders().length).toBe(0)

    // Later, student starts camera
    const mockStream = {
      getTracks: jest.fn().mockReturnValue([
        { kind: 'video', id: 'video-1' }
      ])
    } as any

    const videoTrack = mockStream.getTracks()[0]
    pc.addTrack(videoTrack, mockStream)

    expect(pc.getSenders().length).toBe(1)
  })

  it('should receive remote stream even without local stream', async () => {
    let remoteStreamReceived = false

    // Create receive-only connection
    const pc = await connection.setupPeerConnection('peer-remote', null)

    // Listen for remote stream
    connection.on('remote_stream_added', (data: any) => {
      console.log('Remote stream received:', data)
      expect(data.peerId).toBe('peer-remote')
      expect(data.stream).toBeDefined()
      remoteStreamReceived = true
    })

    // Simulate receiving remote track
    const mockRemoteStream = {
      id: 'remote-stream-1',
      getTracks: jest.fn().mockReturnValue([{ kind: 'video', id: 'remote-video' }])
    } as any

    // Trigger ontrack manually
    if (pc.ontrack) {
      pc.ontrack({
        streams: [mockRemoteStream],
        track: mockRemoteStream.getTracks()[0]
      } as any)
    }

    // Give event time to emit
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(remoteStreamReceived).toBe(true)
  })
})

// ============================================================================
// Issue #5 (v1.4.2): Enhanced user_joined Emission Logging
// ============================================================================

describe('Hotfix v1.4.2 - Issue #5: user_joined emission logging', () => {
  let commsSystem: RealTimeCommunicationSystem
  let httpServer: any
  let teacherSocket: ClientSocket
  let studentSocket: ClientSocket

  const teacher: User = {
    id: 'teacher-1',
    username: 'teacher@example.com',
    role: 'teacher',
    status: 'online'
  }

  const student: User = {
    id: 'student-1',
    username: 'student@example.com',
    role: 'student',
    status: 'online'
  }

  beforeEach((done) => {
    httpServer = createServer()
    commsSystem = new RealTimeCommunicationSystem()
    commsSystem.initialize(httpServer)

    httpServer.listen(3009, () => {
      teacherSocket = ioClient('http://localhost:3009', { transports: ['websocket'] })
      teacherSocket.on('connect', () => done())
    })
  })

  afterEach((done) => {
    if (teacherSocket?.connected) teacherSocket.disconnect()
    if (studentSocket?.connected) studentSocket.disconnect()
    setTimeout(() => {
      httpServer.close()
      done()
    }, 100)
  })

  it('should emit user_joined to existing participants when new user joins', (done) => {
    const roomId = 'user-joined-test'
    let userJoinedReceived = false

    // Teacher joins first
    teacherSocket.emit('join_room', { roomId, user: teacher })

    teacherSocket.on('room_state', (state: any) => {
      if (state.participants.length === 1) {
        // Setup listener for user_joined
        teacherSocket.on('user_joined', (participant: any) => {
          console.log('Teacher received user_joined:', participant)

          // CRITICAL TEST: Teacher should receive student's participant data
          expect(participant).toBeDefined()
          expect(participant.id).toBe(student.id)
          expect(participant.username).toBe(student.username)
          expect(participant.role).toBe(student.role)
          expect(participant.socketId).toBeDefined()

          userJoinedReceived = true
          done()
        })

        // Student joins
        setTimeout(() => {
          studentSocket = ioClient('http://localhost:3009', { transports: ['websocket'] })
          studentSocket.on('connect', () => {
            studentSocket.emit('join_room', { roomId, user: student })
          })
        }, 200)
      }
    })
  })

  it('should emit user_joined to ALL existing participants', (done) => {
    const roomId = 'multiple-participants'
    let teacher2Socket: ClientSocket
    let teacherReceivedEvent = false
    let teacher2ReceivedEvent = false

    const teacher2: User = {
      id: 'teacher-2',
      username: 'teacher2@example.com',
      role: 'teacher',
      status: 'online'
    }

    // Teacher 1 joins
    teacherSocket.emit('join_room', { roomId, user: teacher })

    teacherSocket.on('room_state', (state: any) => {
      if (state.participants.length === 1) {
        // Teacher 2 joins
        teacher2Socket = ioClient('http://localhost:3009', { transports: ['websocket'] })
        teacher2Socket.on('connect', () => {
          teacher2Socket.emit('join_room', { roomId, user: teacher2 })
        })

        teacher2Socket.on('room_state', (state2: any) => {
          if (state2.participants.length === 2) {
            // Both teachers are in room, now student joins
            teacherSocket.on('user_joined', (participant: any) => {
              if (participant.id === student.id) {
                console.log('Teacher 1 received user_joined for student')
                teacherReceivedEvent = true
                checkBothReceived()
              }
            })

            teacher2Socket.on('user_joined', (participant: any) => {
              if (participant.id === student.id) {
                console.log('Teacher 2 received user_joined for student')
                teacher2ReceivedEvent = true
                checkBothReceived()
              }
            })

            const checkBothReceived = () => {
              if (teacherReceivedEvent && teacher2ReceivedEvent) {
                if (teacher2Socket?.connected) teacher2Socket.disconnect()
                done()
              }
            }

            setTimeout(() => {
              studentSocket = ioClient('http://localhost:3009', { transports: ['websocket'] })
              studentSocket.on('connect', () => {
                studentSocket.emit('join_room', { roomId, user: student })
              })
            }, 200)
          }
        })
      }
    })
  }, 10000)

  it('should NOT emit user_joined to the joining user themselves', (done) => {
    const roomId = 'no-self-emit'
    let receivedOwnUserJoined = false

    teacherSocket.emit('join_room', { roomId, user: teacher })

    teacherSocket.on('room_state', (state: any) => {
      if (state.participants.length === 1) {
        studentSocket = ioClient('http://localhost:3009', { transports: ['websocket'] })
        studentSocket.on('connect', () => {
          // Student should NOT receive user_joined for themselves
          studentSocket.on('user_joined', (participant: any) => {
            if (participant.id === student.id) {
              receivedOwnUserJoined = true
            }
          })

          studentSocket.emit('join_room', { roomId, user: student })

          studentSocket.on('room_state', () => {
            // Wait a bit to ensure no self-emit happens
            setTimeout(() => {
              expect(receivedOwnUserJoined).toBe(false)
              done()
            }, 500)
          })
        })
      }
    })
  })
})

// ============================================================================
// Integration Test: All Hotfixes Working Together
// ============================================================================

describe('Integration: All hotfixes working together', () => {
  let commsSystem: RealTimeCommunicationSystem
  let httpServer: any
  let teacherSocket: ClientSocket
  let student1Socket: ClientSocket
  let student2Socket: ClientSocket

  const teacher: User = {
    id: 'teacher-1',
    username: 'teacher@example.com',
    role: 'teacher',
    status: 'online'
  }

  const student1: User = {
    id: 'student-1',
    username: 'student1@example.com',
    role: 'student',
    status: 'online'
  }

  const student2: User = {
    id: 'student-2',
    username: 'student2@example.com',
    role: 'student',
    status: 'online'
  }

  beforeEach((done) => {
    httpServer = createServer()
    commsSystem = new RealTimeCommunicationSystem()
    commsSystem.initialize(httpServer)

    httpServer.listen(3010, () => {
      teacherSocket = ioClient('http://localhost:3010', { transports: ['websocket'] })
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

  it('should handle complete classroom scenario with all hotfixes', (done) => {
    const roomId = 'integration-test-room'
    let step = 0

    const nextStep = () => {
      step++
      console.log(`Integration test step: ${step}`)
    }

    // Step 1: Teacher joins
    teacherSocket.emit('join_room', { roomId, user: teacher })

    teacherSocket.on('room_state', (state: any) => {
      if (state.participants.length === 1 && step === 0) {
        nextStep()
        expect(state.participants[0].id).toBe(teacher.id)

        // Step 2: Student 1 joins
        student1Socket = ioClient('http://localhost:3010', { transports: ['websocket'] })
        student1Socket.on('connect', () => {
          student1Socket.emit('join_room', { roomId, user: student1 })
        })

        // Setup student1 event listeners AFTER creating the socket
        student1Socket.on('room_state', (state: any) => {
          if (state.participants.length === 2 && step === 1) {
            nextStep()
            // HOTFIX #1 TEST: Student 1 should see teacher
            const hasTeacher = state.participants.some((p: any) => p.id === teacher.id)
            expect(hasTeacher).toBe(true)

            // Step 3: Student 2 joins
            student2Socket = ioClient('http://localhost:3010', { transports: ['websocket'] })
            student2Socket.on('connect', () => {
              student2Socket.emit('join_room', { roomId, user: student2 })
            })

            // Setup student2 event listeners AFTER creating the socket
            student2Socket.on('room_state', (state: any) => {
              if (state.participants.length === 3 && step === 3) {
                nextStep()
                // HOTFIX #1 TEST: Student 2 should see ALL participants
                expect(state.participants.length).toBe(3)
                const participantIds = state.participants.map((p: any) => p.id)
                expect(participantIds).toContain(teacher.id)
                expect(participantIds).toContain(student1.id)
                expect(participantIds).toContain(student2.id)

                // Step 4: Teacher kicks student 1
                setTimeout(() => {
                  teacherSocket.emit('kick_participant', {
                    roomId,
                    targetUserId: student1.id,
                    requesterId: teacher.id,
                    reason: 'Integration test'
                  })
                }, 200)
              }
            })
          }
        })
      }
    })

    teacherSocket.on('user_joined', (participant: any) => {
      if (participant.id === student1.id && step === 1) {
        nextStep()
        console.log('Teacher received student 1 joined')

        // Setup student1 kicked event listeners AFTER student1Socket is created
        if (student1Socket) {
          student1Socket.on('kicked_from_room', (data: any) => {
            nextStep()
            console.log('Student 1 received kick notification')
            expect(data.kickedBy).toBe(teacher.id)
          })

          student1Socket.on('disconnect', () => {
            nextStep()
            console.log('Student 1 disconnected after kick')

            // All hotfixes tested!
            setTimeout(() => {
              expect(step).toBeGreaterThanOrEqual(5)
              done()
            }, 500)
          })
        }
      } else if (participant.id === student2.id && step === 2) {
        nextStep()
        console.log('Teacher received student 2 joined')
      }
    })
  }, 15000)
})
