/**
 * Integration tests for WebRTC signaling flow (v1.2.0)
 * Tests the complete peer-to-peer connection establishment
 */

import { RoomConnection } from '../services/RoomConnection'
import { User } from '../interfaces/user.interface'
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client'

// Mock RTCPeerConnection
global.RTCPeerConnection = jest.fn().mockImplementation(() => {
  const pc = {
    createOffer: jest.fn(),
    createAnswer: jest.fn(),
    setLocalDescription: jest.fn(),
    setRemoteDescription: jest.fn(),
    addIceCandidate: jest.fn(),
    addTrack: jest.fn().mockReturnValue({
      track: null,
      replaceTrack: jest.fn().mockResolvedValue(undefined)
    }),
    getSenders: jest.fn(() => []),
    close: jest.fn(),
    localDescription: null,
    remoteDescription: null,
    ontrack: null,
    onicecandidate: null,
    oniceconnectionstatechange: null,
    iceConnectionState: 'new'
  }
  return pc
}) as any

// Mock WebRTCService factory
const createMockWebRTCInstance = () => ({
  on: jest.fn().mockReturnThis(),
  createOffer: jest.fn(),
  handleOffer: jest.fn(),
  handleAnswer: jest.fn(),
  handleIceCandidate: jest.fn(),
  closeConnection: jest.fn(),
})

let mockWebRTCInstance = createMockWebRTCInstance()

jest.mock('../services/WebRTCService', () => {
  return {
    WebRTCService: jest.fn().mockImplementation(() => mockWebRTCInstance),
  }
})

// Mock Socket.IO client
jest.mock('socket.io-client', () => {
  const mockSocket = {
    on: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    id: 'mock-socket-id',
  }

  return {
    io: jest.fn(() => mockSocket),
  }
})

describe('WebRTC Integration Tests (v1.2.0)', () => {
  let peer1: RoomConnection
  let peer2: RoomConnection
  let mockUser1: User
  let mockUser2: User
  let mockLocalStream1: MediaStream
  let mockLocalStream2: MediaStream

  beforeEach(() => {
    // Recreate mock instance to avoid reset issues
    mockWebRTCInstance = createMockWebRTCInstance()

    // Update the WebRTCService mock to return the new instance
    const WebRTCService = require('../services/WebRTCService').WebRTCService as jest.Mock
    WebRTCService.mockImplementation(() => mockWebRTCInstance)

    mockUser1 = {
      id: 'user-1',
      username: 'peer1',
      role: 'teacher',
      status: 'online',
    }

    mockUser2 = {
      id: 'user-2',
      username: 'peer2',
      role: 'student',
      status: 'online',
    }

    // Mock MediaStreams
    mockLocalStream1 = {
      getTracks: jest.fn(() => [
        { kind: 'video', stop: jest.fn() },
        { kind: 'audio', stop: jest.fn() },
      ]),
      getVideoTracks: jest.fn(() => [{ kind: 'video', stop: jest.fn(), onended: null }]),
    } as any

    mockLocalStream2 = {
      getTracks: jest.fn(() => [
        { kind: 'video', stop: jest.fn() },
        { kind: 'audio', stop: jest.fn() },
      ]),
      getVideoTracks: jest.fn(() => [{ kind: 'video', stop: jest.fn(), onended: null }]),
    } as any

    peer1 = new RoomConnection('room-123', mockUser1, 'ws://localhost:3001')
    peer2 = new RoomConnection('room-123', mockUser2, 'ws://localhost:3001')
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Full WebRTC Connection Flow', () => {
    it('should establish peer connection through offer/answer exchange', async () => {
      // Setup peer connections
      const pc1 = await peer1.setupPeerConnection('peer-2', mockLocalStream1)
      const pc2 = await peer2.setupPeerConnection('peer-1', mockLocalStream2)

      // Mock offer/answer creation
      const mockOffer = { type: 'offer', sdp: 'offer-sdp' } as RTCSessionDescriptionInit
      const mockAnswer = { type: 'answer', sdp: 'answer-sdp' } as RTCSessionDescriptionInit

      jest.spyOn(pc1, 'createOffer').mockResolvedValue(mockOffer as any)
      jest.spyOn(pc1, 'setLocalDescription').mockResolvedValue()
      jest.spyOn(pc1, 'setRemoteDescription').mockResolvedValue()

      jest.spyOn(pc2, 'createAnswer').mockResolvedValue(mockAnswer as any)
      jest.spyOn(pc2, 'setLocalDescription').mockResolvedValue()
      jest.spyOn(pc2, 'setRemoteDescription').mockResolvedValue()

      // Peer 1 creates offer
      await peer1.createOffer('peer-2')

      expect(pc1.createOffer).toHaveBeenCalled()
      expect(pc1.setLocalDescription).toHaveBeenCalledWith(mockOffer)

      // Peer 2 receives offer and sends answer
      await peer2.handleWebRTCOffer('peer-1', mockOffer)

      expect(pc2.setRemoteDescription).toHaveBeenCalled()
      expect(pc2.createAnswer).toHaveBeenCalled()
      expect(pc2.setLocalDescription).toHaveBeenCalledWith(mockAnswer)

      // Peer 1 receives answer
      await peer1.handleWebRTCAnswer('peer-2', mockAnswer)

      expect(pc1.setRemoteDescription).toHaveBeenCalled()
    })

    it('should exchange ICE candidates', async () => {
      const pc1 = await peer1.setupPeerConnection('peer-2', mockLocalStream1)
      const pc2 = await peer2.setupPeerConnection('peer-1', mockLocalStream2)

      const mockCandidate1 = {
        candidate: 'candidate:1',
        sdpMid: '0',
        sdpMLineIndex: 0,
      } as RTCIceCandidateInit

      const mockCandidate2 = {
        candidate: 'candidate:2',
        sdpMid: '0',
        sdpMLineIndex: 0,
      } as RTCIceCandidateInit

      jest.spyOn(pc1, 'addIceCandidate').mockResolvedValue()
      jest.spyOn(pc2, 'addIceCandidate').mockResolvedValue()

      // Peer 1 sends candidate to Peer 2
      await peer2.handleWebRTCIceCandidate('peer-1', mockCandidate1)
      expect(pc2.addIceCandidate).toHaveBeenCalled()

      // Peer 2 sends candidate to Peer 1
      await peer1.handleWebRTCIceCandidate('peer-2', mockCandidate2)
      expect(pc1.addIceCandidate).toHaveBeenCalled()
    })

    it('should handle remote stream events', async () => {
      const emitSpy1 = jest.spyOn(peer1, 'emit')
      const emitSpy2 = jest.spyOn(peer2, 'emit')

      const pc1 = await peer1.setupPeerConnection('peer-2', mockLocalStream1)
      const pc2 = await peer2.setupPeerConnection('peer-1', mockLocalStream2)

      // Simulate receiving remote streams
      const remoteStream1 = { id: 'remote-stream-1' } as MediaStream
      const remoteStream2 = { id: 'remote-stream-2' } as MediaStream

      // Peer 1 receives Peer 2's stream
      if (pc1.ontrack) {
        pc1.ontrack({ streams: [remoteStream2] } as any)
      }

      expect(emitSpy1).toHaveBeenCalledWith('remote_stream_added', {
        peerId: 'peer-2',
        stream: remoteStream2,
      })

      // Peer 2 receives Peer 1's stream
      if (pc2.ontrack) {
        pc2.ontrack({ streams: [remoteStream1] } as any)
      }

      expect(emitSpy2).toHaveBeenCalledWith('remote_stream_added', {
        peerId: 'peer-1',
        stream: remoteStream1,
      })
    })

    it('should manage multiple peer connections', async () => {
      // Peer 1 connects to multiple peers
      const pc1_to_peer2 = await peer1.setupPeerConnection('peer-2', mockLocalStream1)
      const pc1_to_peer3 = await peer1.setupPeerConnection('peer-3', mockLocalStream1)

      expect((peer1 as any).peerConnections.size).toBe(2)
      expect((peer1 as any).peerConnections.has('peer-2')).toBe(true)
      expect((peer1 as any).peerConnections.has('peer-3')).toBe(true)
    })

    it('should cleanup specific peer connection', async () => {
      await peer1.setupPeerConnection('peer-2', mockLocalStream1)
      await peer1.setupPeerConnection('peer-3', mockLocalStream1)

      expect((peer1 as any).peerConnections.size).toBe(2)

      // Close connection to peer-2
      peer1.closePeerConnection('peer-2')

      expect((peer1 as any).peerConnections.size).toBe(1)
      expect((peer1 as any).peerConnections.has('peer-2')).toBe(false)
      expect((peer1 as any).peerConnections.has('peer-3')).toBe(true)
    })

    it('should retrieve remote streams', async () => {
      const pc1 = await peer1.setupPeerConnection('peer-2', mockLocalStream1)

      const remoteStream = { id: 'remote-stream' } as MediaStream

      // Simulate receiving remote stream
      if (pc1.ontrack) {
        pc1.ontrack({ streams: [remoteStream] } as any)
      }

      // Retrieve the stream
      const retrievedStream = peer1.getRemoteStream('peer-2')
      expect(retrievedStream).toBe(remoteStream)
    })

    it('should get all remote streams', async () => {
      const pc1 = await peer1.setupPeerConnection('peer-2', mockLocalStream1)
      const pc2 = await peer1.setupPeerConnection('peer-3', mockLocalStream1)

      const remoteStream1 = { id: 'remote-stream-1' } as MediaStream
      const remoteStream2 = { id: 'remote-stream-2' } as MediaStream

      // Simulate receiving remote streams
      if (pc1.ontrack) {
        pc1.ontrack({ streams: [remoteStream1] } as any)
      }
      if (pc2.ontrack) {
        pc2.ontrack({ streams: [remoteStream2] } as any)
      }

      const allStreams = peer1.getAllRemoteStreams()
      expect(allStreams.size).toBe(2)
      expect(allStreams.get('peer-2')).toBe(remoteStream1)
      expect(allStreams.get('peer-3')).toBe(remoteStream2)
    })
  })

  describe('Screen Sharing Integration', () => {
    beforeEach(() => {
      // Mock getDisplayMedia
      Object.defineProperty(global.navigator, 'mediaDevices', {
        value: {
          getDisplayMedia: jest.fn(),
        },
        writable: true,
        configurable: true
      })
    })

    it('should switch to screen sharing across all peer connections', async () => {
      const mockScreenStream = {
        getTracks: jest.fn(() => []),
        getVideoTracks: jest.fn(() => [
          { kind: 'video', stop: jest.fn(), onended: null },
        ]),
      } as any

      ;(navigator.mediaDevices.getDisplayMedia as jest.Mock).mockResolvedValue(mockScreenStream)

      // Setup multiple peer connections
      const pc1 = await peer1.setupPeerConnection('peer-2', mockLocalStream1)
      const pc2 = await peer1.setupPeerConnection('peer-3', mockLocalStream1)

      const mockSender1 = {
        track: { kind: 'video' },
        replaceTrack: jest.fn().mockResolvedValue(undefined),
      }
      const mockSender2 = {
        track: { kind: 'video' },
        replaceTrack: jest.fn().mockResolvedValue(undefined),
      }

      jest.spyOn(pc1, 'getSenders').mockReturnValue([mockSender1 as any])
      jest.spyOn(pc2, 'getSenders').mockReturnValue([mockSender2 as any])

      // Start screen sharing
      await peer1.startScreenShare()

      // Verify track was replaced in all connections
      expect(mockSender1.replaceTrack).toHaveBeenCalled()
      expect(mockSender2.replaceTrack).toHaveBeenCalled()
    })

    it('should emit screen share events', async () => {
      const emitSpy = jest.spyOn(peer1, 'emit')

      const mockScreenStream = {
        getTracks: jest.fn(() => [{ stop: jest.fn() }]),
        getVideoTracks: jest.fn(() => [
          { kind: 'video', stop: jest.fn(), onended: null },
        ]),
      } as any

      ;(navigator.mediaDevices.getDisplayMedia as jest.Mock).mockResolvedValue(mockScreenStream)

      await peer1.startScreenShare()

      expect(emitSpy).toHaveBeenCalledWith('screen_share_started')

      peer1.stopScreenShare()

      expect(emitSpy).toHaveBeenCalledWith('screen_share_stopped')
    })

    it('should restore camera stream after screen sharing', async () => {
      const mockScreenStream = {
        getTracks: jest.fn(() => [{ stop: jest.fn() }]),
        getVideoTracks: jest.fn(() => [
          { kind: 'video', stop: jest.fn(), onended: null },
        ]),
      } as any

      ;(navigator.mediaDevices.getDisplayMedia as jest.Mock).mockResolvedValue(mockScreenStream)

      const pc1 = await peer1.setupPeerConnection('peer-2', mockLocalStream1)

      const mockOriginalTrack = { kind: 'video' }
      const mockSender = {
        track: mockOriginalTrack,
        replaceTrack: jest.fn().mockResolvedValue(undefined),
      }

      jest.spyOn(pc1, 'getSenders').mockReturnValue([mockSender as any])

      // Start screen sharing (saves original track)
      await peer1.startScreenShare()

      // Stop screen sharing (should restore original track)
      peer1.stopScreenShare()

      // Verify replaceTrack was called twice (once for screen, once for camera)
      expect(mockSender.replaceTrack).toHaveBeenCalledTimes(2)
    })
  })

  describe('Error Handling', () => {
    it('should throw error when creating offer without peer connection', async () => {
      await expect(peer1.createOffer('non-existent-peer')).rejects.toThrow(
        'No peer connection found for non-existent-peer'
      )
    })

    it('should throw error when handling offer without peer connection', async () => {
      const mockOffer = { type: 'offer', sdp: 'mock-sdp' } as RTCSessionDescriptionInit

      await expect(peer1.handleWebRTCOffer('non-existent-peer', mockOffer)).rejects.toThrow(
        'No peer connection found for non-existent-peer'
      )
    })

    it('should throw error when handling answer without peer connection', async () => {
      const mockAnswer = { type: 'answer', sdp: 'mock-answer-sdp' } as RTCSessionDescriptionInit

      await expect(peer1.handleWebRTCAnswer('non-existent-peer', mockAnswer)).rejects.toThrow(
        'No peer connection found for non-existent-peer'
      )
    })

    it('should not throw when handling ICE candidate without peer connection', async () => {
      const mockCandidate = {
        candidate: 'candidate:123456',
        sdpMid: '0',
        sdpMLineIndex: 0,
      } as RTCIceCandidateInit

      // Should just log warning, not throw
      await expect(
        peer1.handleWebRTCIceCandidate('non-existent-peer', mockCandidate)
      ).resolves.not.toThrow()
    })
  })

  describe('Connection Lifecycle', () => {
    it('should handle ICE connection state changes', async () => {
      const pc = await peer1.setupPeerConnection('peer-2', mockLocalStream1)

      // Verify oniceconnectionstatechange handler is set
      expect(pc.oniceconnectionstatechange).toBeDefined()

      // Simulate connection state changes
      if (pc.oniceconnectionstatechange) {
        // Simulate connected state
        Object.defineProperty(pc, 'iceConnectionState', { value: 'connected', writable: true })
        pc.oniceconnectionstatechange({} as Event)

        // Simulate disconnected state
        Object.defineProperty(pc, 'iceConnectionState', { value: 'disconnected', writable: true })
        pc.oniceconnectionstatechange({} as Event)

        // Simulate failed state
        Object.defineProperty(pc, 'iceConnectionState', { value: 'failed', writable: true })
        pc.oniceconnectionstatechange({} as Event)
      }

      // Connection should still exist
      expect((peer1 as any).peerConnections.has('peer-2')).toBe(true)
    })

    it('should cleanup on peer connection close', async () => {
      const pc = await peer1.setupPeerConnection('peer-2', mockLocalStream1)

      jest.spyOn(pc, 'close').mockImplementation()

      peer1.closePeerConnection('peer-2')

      expect(pc.close).toHaveBeenCalled()
      expect((peer1 as any).peerConnections.has('peer-2')).toBe(false)
      expect((peer1 as any).remoteStreams.has('peer-2')).toBe(false)
    })

    it('should remove remote stream when peer disconnects', async () => {
      const emitSpy = jest.spyOn(peer1, 'emit')
      const pc = await peer1.setupPeerConnection('peer-2', mockLocalStream1)

      // Add remote stream
      const remoteStream = { id: 'remote-stream' } as MediaStream
      if (pc.ontrack) {
        pc.ontrack({ streams: [remoteStream] } as any)
      }

      expect((peer1 as any).remoteStreams.has('peer-2')).toBe(true)

      // Close connection
      peer1.closePeerConnection('peer-2')

      // Remote stream should be removed
      expect((peer1 as any).remoteStreams.has('peer-2')).toBe(false)
    })
  })
})
