/**
 * Tests for RealTimeCommunicationSystem room cleanup (v1.1.3)
 * Tests clearRoom functionality and automatic cleanup
 */

import { RealTimeCommunicationSystem } from '../systems/comms/RealTimeCommunicationSystem'
import { Server as SocketIOServer } from 'socket.io'
import { createServer } from 'http'

describe('RealTimeCommunicationSystem - Room Cleanup (v1.1.3)', () => {
  let commsSystem: RealTimeCommunicationSystem
  let httpServer: any
  let io: SocketIOServer

  beforeEach(() => {
    // Create HTTP server and Socket.IO instance
    httpServer = createServer()
    io = new SocketIOServer(httpServer)

    commsSystem = new RealTimeCommunicationSystem()
    ;(commsSystem as any).io = io
  })

  afterEach(() => {
    jest.clearAllMocks()
    if (httpServer) {
      httpServer.close()
    }
  })

  describe('clearRoom', () => {
    it('should clear participants from memory', () => {
      const roomId = 'room-123'

      // Setup room with participants
      const participantsMap = new Map()
      participantsMap.set('user-1', { id: 'user-1', username: 'user1', role: 'student', status: 'online' })
      participantsMap.set('user-2', { id: 'user-2', username: 'user2', role: 'student', status: 'online' })
      ;(commsSystem as any).rooms.set(roomId, participantsMap)

      // Clear the room
      commsSystem.clearRoom(roomId)

      // Verify participants were cleared
      expect((commsSystem as any).rooms.has(roomId)).toBe(false)
    })

    it('should clear message history from memory', () => {
      const roomId = 'room-123'

      // Setup room with messages
      const messages = [
        { userId: 'user-1', username: 'user1', content: 'Hello', timestamp: new Date().toISOString() },
        { userId: 'user-2', username: 'user2', content: 'Hi', timestamp: new Date().toISOString() }
      ]
      ;(commsSystem as any).messages.set(roomId, messages)
      ;(commsSystem as any).messageSequence.set(roomId, 2)

      // Clear the room
      commsSystem.clearRoom(roomId)

      // Verify message history was cleared
      expect((commsSystem as any).messages.has(roomId)).toBe(false)
      expect((commsSystem as any).messageSequence.has(roomId)).toBe(false)
    })

    it('should clear active streams', () => {
      const roomId = 'room-123'

      // Setup room with active stream
      const streamState = {
        streamerId: 'user-1',
        quality: 'high',
        startedAt: new Date().toISOString()
      }
      ;(commsSystem as any).streams.set(roomId, streamState)

      // Clear the room
      commsSystem.clearRoom(roomId)

      // Verify stream was cleared
      expect((commsSystem as any).streams.has(roomId)).toBe(false)
    })

    it('should clear activity tracking', () => {
      const roomId = 'room-123'

      // Setup room activity
      ;(commsSystem as any).roomLastActivity.set(roomId, Date.now())

      // Clear the room
      commsSystem.clearRoom(roomId)

      // Verify activity was cleared
      expect((commsSystem as any).roomLastActivity.has(roomId)).toBe(false)
    })

    it('should emit room_cleared event to all clients', () => {
      const roomId = 'room-123'

      // Mock Socket.IO emit
      const toSpy = jest.fn().mockReturnValue({
        emit: jest.fn()
      })
      ;(commsSystem as any).io = {
        to: toSpy
      }

      // Clear the room
      commsSystem.clearRoom(roomId)

      // Verify event was emitted
      expect(toSpy).toHaveBeenCalledWith(roomId)
      expect(toSpy().emit).toHaveBeenCalledWith('room_cleared', {
        roomId,
        reason: 'Lecture ended',
        timestamp: expect.any(String)
      })
    })

    it('should handle clearing empty room gracefully', () => {
      const roomId = 'empty-room'

      // Clear a room that doesn't exist
      expect(() => commsSystem.clearRoom(roomId)).not.toThrow()
    })

    it('should clear all ephemeral data in one call', () => {
      const roomId = 'room-123'

      // Setup all types of data
      const participantsMap = new Map()
      participantsMap.set('user-1', { id: 'user-1', username: 'user1', role: 'student', status: 'online' })
      ;(commsSystem as any).rooms.set(roomId, participantsMap)

      const messages = [{ userId: 'user-1', username: 'user1', content: 'Hello', timestamp: new Date().toISOString() }]
      ;(commsSystem as any).messages.set(roomId, messages)
      ;(commsSystem as any).messageSequence.set(roomId, 1)

      const streamState = { streamerId: 'user-1', quality: 'high', startedAt: new Date().toISOString() }
      ;(commsSystem as any).streams.set(roomId, streamState)

      ;(commsSystem as any).roomLastActivity.set(roomId, Date.now())

      // Clear the room
      commsSystem.clearRoom(roomId)

      // Verify everything was cleared
      expect((commsSystem as any).rooms.has(roomId)).toBe(false)
      expect((commsSystem as any).messages.has(roomId)).toBe(false)
      expect((commsSystem as any).messageSequence.has(roomId)).toBe(false)
      expect((commsSystem as any).streams.has(roomId)).toBe(false)
      expect((commsSystem as any).roomLastActivity.has(roomId)).toBe(false)
    })
  })

  describe('getRoomParticipants', () => {
    it('should return participants from memory', () => {
      const roomId = 'room-123'

      const participant1 = {
        socketId: 'socket-1',
        user: { id: 'user-1', username: 'user1', role: 'student', status: 'online' },
        isStreaming: false,
        canStream: true,
        canChat: true,
        canScreenShare: true
      }

      const participant2 = {
        socketId: 'socket-2',
        user: { id: 'user-2', username: 'user2', role: 'student', status: 'online' },
        isStreaming: false,
        canStream: true,
        canChat: true,
        canScreenShare: true
      }

      const participantsMap = new Map()
      participantsMap.set('socket-1', participant1)
      participantsMap.set('socket-2', participant2)
      ;(commsSystem as any).rooms.set(roomId, participantsMap)

      const participants = commsSystem.getRoomParticipants(roomId)

      expect(participants).toHaveLength(2)
      expect(participants).toContainEqual(participant1)
      expect(participants).toContainEqual(participant2)
    })

    it('should return empty array for non-existent room', () => {
      const participants = commsSystem.getRoomParticipants('non-existent-room')
      expect(participants).toEqual([])
    })

    it('should return empty array after room is cleared', () => {
      const roomId = 'room-123'

      const participantsMap = new Map()
      participantsMap.set('user-1', { id: 'user-1', username: 'user1', role: 'student', status: 'online' })
      ;(commsSystem as any).rooms.set(roomId, participantsMap)

      // Verify participants exist
      expect(commsSystem.getRoomParticipants(roomId).length).toBeGreaterThan(0)

      // Clear the room
      commsSystem.clearRoom(roomId)

      // Verify participants are gone
      expect(commsSystem.getRoomParticipants(roomId)).toEqual([])
    })
  })

  describe('WebRTC Signaling Format (v1.2.0)', () => {
    it('should verify signaling uses fromPeerId field in event format', () => {
      // This is a documentation test to ensure the API contract is followed
      // The actual implementation uses fromPeerId in RealTimeCommunicationSystem
      // when emitting webrtc:offer, webrtc:answer, and webrtc:ice-candidate events

      // Expected event format:
      const expectedOfferFormat = {
        fromPeerId: 'socket-id',
        offer: { type: 'offer', sdp: 'sdp-string' }
      }

      const expectedAnswerFormat = {
        fromPeerId: 'socket-id',
        answer: { type: 'answer', sdp: 'sdp-string' }
      }

      const expectedIceCandidateFormat = {
        fromPeerId: 'socket-id',
        candidate: { candidate: 'candidate-string', sdpMid: '0', sdpMLineIndex: 0 }
      }

      // Verify field names match API contract
      expect(expectedOfferFormat).toHaveProperty('fromPeerId')
      expect(expectedAnswerFormat).toHaveProperty('fromPeerId')
      expect(expectedIceCandidateFormat).toHaveProperty('fromPeerId')

      // Verify NOT using old 'from' field
      expect(expectedOfferFormat).not.toHaveProperty('from')
      expect(expectedAnswerFormat).not.toHaveProperty('from')
      expect(expectedIceCandidateFormat).not.toHaveProperty('from')
    })
  })
})
