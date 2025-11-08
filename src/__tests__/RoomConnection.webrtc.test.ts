/**
 * Tests for RoomConnection WebRTC features (v1.2.0)
 * Tests peer connection setup, signaling, and screen sharing
 */

import { RoomConnection } from '../services/RoomConnection'
import { User } from '../interfaces/user.interface'

// Mock RTCPeerConnection factory
const createMockRTCPeerConnection = () => ({
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
})

// Initialize global mocks
global.RTCPeerConnection = jest.fn().mockImplementation(createMockRTCPeerConnection) as any
global.RTCSessionDescription = jest.fn((init) => init) as any
global.RTCIceCandidate = jest.fn((init) => init) as any

// Mock Socket.IO - use a single object and reset its methods in beforeEach
const mockSocket = {
  on: jest.fn(),
  emit: jest.fn(),
  connect: jest.fn(),
  disconnect: jest.fn(),
  id: 'mock-socket-id',
}

jest.mock('socket.io-client', () => {
  return {
    io: jest.fn(() => mockSocket),
  }
})

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

describe('RoomConnection - WebRTC Features (v1.2.0)', () => {
  let connection: RoomConnection
  let mockUser: User
  let mockLocalStream: MediaStream

  beforeEach(() => {
    // Recreate RTCPeerConnection mock to avoid reset issues
    global.RTCPeerConnection = jest.fn().mockImplementation(createMockRTCPeerConnection) as any

    // Recreate mock instance to avoid reset issues
    mockWebRTCInstance = createMockWebRTCInstance()

    // Update the WebRTCService mock to return the new instance
    const WebRTCService = require('../services/WebRTCService').WebRTCService as jest.Mock
    WebRTCService.mockImplementation(() => mockWebRTCInstance)

    // Reset socket mock methods (keep same object reference)
    mockSocket.on = jest.fn()
    mockSocket.emit = jest.fn()
    mockSocket.connect = jest.fn()
    mockSocket.disconnect = jest.fn()

    // Reset io mock to return mockSocket
    const { io } = require('socket.io-client')
    ;(io as jest.Mock).mockReturnValue(mockSocket)

    mockUser = {
      id: 'user-123',
      username: 'testuser',
      role: 'teacher',
      status: 'online',
    }

    // Mock MediaStream
    mockLocalStream = {
      getTracks: jest.fn(() => [
        { kind: 'video', stop: jest.fn() },
        { kind: 'audio', stop: jest.fn() },
      ]),
      getVideoTracks: jest.fn(() => [{ kind: 'video', stop: jest.fn(), onended: null }]),
    } as any

    connection = new RoomConnection('room-123', mockUser, 'ws://localhost:3001')
    connection.connect() // Initialize socket
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('setupPeerConnection', () => {
    it('should create RTCPeerConnection with STUN servers', async () => {
      const pc = await connection.setupPeerConnection('peer-123', mockLocalStream)

      expect(pc).toBeDefined()
      expect(pc).toHaveProperty('createOffer')
      expect(pc).toHaveProperty('addTrack')
      expect((connection as any).peerConnections.has('peer-123')).toBe(true)
    })

    it('should add local tracks to peer connection', async () => {
      const pc = await connection.setupPeerConnection('peer-123', mockLocalStream)

      // Verify getTracks was called to add tracks
      expect(mockLocalStream.getTracks).toHaveBeenCalled()
    })

    it('should store peer connection in map', async () => {
      await connection.setupPeerConnection('peer-123', mockLocalStream)

      const peerConnections = (connection as any).peerConnections
      expect(peerConnections.size).toBe(1)
      expect(peerConnections.has('peer-123')).toBe(true)
    })

    it('should emit remote_stream_added when track received', async () => {
      const emitSpy = jest.spyOn(connection, 'emit')
      const pc = await connection.setupPeerConnection('peer-123', mockLocalStream)

      // Simulate receiving a remote track
      const mockRemoteStream = { id: 'remote-stream' } as MediaStream
      const mockEvent = { streams: [mockRemoteStream] }

      // Trigger ontrack handler
      if (pc.ontrack) {
        pc.ontrack(mockEvent as any)
      }

      expect(emitSpy).toHaveBeenCalledWith('remote_stream_added', {
        peerId: 'peer-123',
        stream: mockRemoteStream,
      })
    })
  })

  describe('createOffer', () => {
    it('should create and send WebRTC offer', async () => {
      // Setup peer connection first
      const pc = await connection.setupPeerConnection('peer-123', mockLocalStream)

      // Mock createOffer
      const mockOffer = { type: 'offer', sdp: 'mock-sdp' } as RTCSessionDescriptionInit
      jest.spyOn(pc, 'createOffer').mockResolvedValue(mockOffer as any)
      jest.spyOn(pc, 'setLocalDescription').mockResolvedValue()

      await connection.createOffer('peer-123')

      expect(pc.createOffer).toHaveBeenCalledWith({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      })
      expect(pc.setLocalDescription).toHaveBeenCalledWith(mockOffer)
      expect(mockSocket.emit).toHaveBeenCalledWith('webrtc:offer', {
        targetPeerId: 'peer-123',
        offer: pc.localDescription,
      })
    })

    it('should throw error if peer connection not found', async () => {
      await expect(connection.createOffer('non-existent-peer')).rejects.toThrow(
        'No peer connection found for non-existent-peer'
      )
    })
  })

  describe('handleWebRTCOffer', () => {
    it('should handle offer and send answer', async () => {
      const pc = await connection.setupPeerConnection('peer-123', mockLocalStream)

      const mockOffer = { type: 'offer', sdp: 'mock-sdp' } as RTCSessionDescriptionInit
      const mockAnswer = { type: 'answer', sdp: 'mock-answer-sdp' } as RTCSessionDescriptionInit

      jest.spyOn(pc, 'setRemoteDescription').mockResolvedValue()
      jest.spyOn(pc, 'createAnswer').mockResolvedValue(mockAnswer as any)
      jest.spyOn(pc, 'setLocalDescription').mockResolvedValue()

      await connection.handleWebRTCOffer('peer-123', mockOffer)

      expect(pc.setRemoteDescription).toHaveBeenCalled()
      expect(pc.createAnswer).toHaveBeenCalled()
      expect(pc.setLocalDescription).toHaveBeenCalledWith(mockAnswer)
      expect(mockSocket.emit).toHaveBeenCalledWith('webrtc:answer', {
        targetPeerId: 'peer-123',
        answer: pc.localDescription,
      })
    })

    it('should throw error if peer connection not found', async () => {
      const mockOffer = { type: 'offer', sdp: 'mock-sdp' } as RTCSessionDescriptionInit

      await expect(connection.handleWebRTCOffer('non-existent-peer', mockOffer)).rejects.toThrow(
        'No peer connection found for non-existent-peer'
      )
    })
  })

  describe('handleWebRTCAnswer', () => {
    it('should set remote description with answer', async () => {
      const pc = await connection.setupPeerConnection('peer-123', mockLocalStream)

      const mockAnswer = { type: 'answer', sdp: 'mock-answer-sdp' } as RTCSessionDescriptionInit

      jest.spyOn(pc, 'setRemoteDescription').mockResolvedValue()

      await connection.handleWebRTCAnswer('peer-123', mockAnswer)

      expect(pc.setRemoteDescription).toHaveBeenCalled()
    })

    it('should throw error if peer connection not found', async () => {
      const mockAnswer = { type: 'answer', sdp: 'mock-answer-sdp' } as RTCSessionDescriptionInit

      await expect(connection.handleWebRTCAnswer('non-existent-peer', mockAnswer)).rejects.toThrow(
        'No peer connection found for non-existent-peer'
      )
    })
  })

  describe('handleWebRTCIceCandidate', () => {
    it('should add ICE candidate to peer connection', async () => {
      const pc = await connection.setupPeerConnection('peer-123', mockLocalStream)

      const mockCandidate = {
        candidate: 'candidate:123456',
        sdpMid: '0',
        sdpMLineIndex: 0,
      } as RTCIceCandidateInit

      jest.spyOn(pc, 'addIceCandidate').mockResolvedValue()

      await connection.handleWebRTCIceCandidate('peer-123', mockCandidate)

      expect(pc.addIceCandidate).toHaveBeenCalled()
    })

    it('should not throw if peer connection not found', async () => {
      const mockCandidate = {
        candidate: 'candidate:123456',
        sdpMid: '0',
        sdpMLineIndex: 0,
      } as RTCIceCandidateInit

      // Should just log warning, not throw
      await expect(
        connection.handleWebRTCIceCandidate('non-existent-peer', mockCandidate)
      ).resolves.not.toThrow()
    })
  })

  describe('closePeerConnection', () => {
    it('should close and cleanup peer connection', async () => {
      const pc = await connection.setupPeerConnection('peer-123', mockLocalStream)

      jest.spyOn(pc, 'close').mockImplementation()

      connection.closePeerConnection('peer-123')

      expect(pc.close).toHaveBeenCalled()
      expect((connection as any).peerConnections.has('peer-123')).toBe(false)
      expect((connection as any).remoteStreams.has('peer-123')).toBe(false)
    })

    it('should handle closing non-existent connection gracefully', () => {
      expect(() => connection.closePeerConnection('non-existent-peer')).not.toThrow()
    })
  })

  describe('getRemoteStream', () => {
    it('should return remote stream for peer', async () => {
      const mockRemoteStream = { id: 'remote-stream' } as MediaStream
      ;(connection as any).remoteStreams.set('peer-123', mockRemoteStream)

      const stream = connection.getRemoteStream('peer-123')

      expect(stream).toBe(mockRemoteStream)
    })

    it('should return undefined for non-existent peer', () => {
      const stream = connection.getRemoteStream('non-existent-peer')

      expect(stream).toBeUndefined()
    })
  })

  describe('getAllRemoteStreams', () => {
    it('should return all remote streams', async () => {
      const mockStream1 = { id: 'stream-1' } as MediaStream
      const mockStream2 = { id: 'stream-2' } as MediaStream

      ;(connection as any).remoteStreams.set('peer-1', mockStream1)
      ;(connection as any).remoteStreams.set('peer-2', mockStream2)

      const streams = connection.getAllRemoteStreams()

      expect(streams.size).toBe(2)
      expect(streams.get('peer-1')).toBe(mockStream1)
      expect(streams.get('peer-2')).toBe(mockStream2)
    })
  })

  describe('Screen Sharing (v1.3.0)', () => {
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

    describe('startScreenShare', () => {
      it('should get screen share stream and replace video track', async () => {
        const mockScreenStream = {
          getTracks: jest.fn(() => []),
          getVideoTracks: jest.fn(() => [
            { kind: 'video', stop: jest.fn(), onended: null },
          ]),
        } as any

        ;(navigator.mediaDevices.getDisplayMedia as jest.Mock).mockResolvedValue(mockScreenStream)

        // Setup a peer connection with mock sender
        const pc = await connection.setupPeerConnection('peer-123', mockLocalStream)
        const mockSender = {
          track: { kind: 'video' },
          replaceTrack: jest.fn().mockResolvedValue(undefined),
        }
        jest.spyOn(pc, 'getSenders').mockReturnValue([mockSender as any])

        const screenStream = await connection.startScreenShare()

        expect(navigator.mediaDevices.getDisplayMedia).toHaveBeenCalled()
        expect(screenStream).toBe(mockScreenStream)
        expect(mockSender.replaceTrack).toHaveBeenCalled()
      })

      it('should emit screen_share_started event', async () => {
        const emitSpy = jest.spyOn(connection, 'emit')

        const mockScreenStream = {
          getTracks: jest.fn(() => []),
          getVideoTracks: jest.fn(() => [
            { kind: 'video', stop: jest.fn(), onended: null },
          ]),
        } as any

        ;(navigator.mediaDevices.getDisplayMedia as jest.Mock).mockResolvedValue(mockScreenStream)

        await connection.startScreenShare()

        expect(emitSpy).toHaveBeenCalledWith('screen_share_started')
      })
    })

    describe('stopScreenShare', () => {
      it('should stop screen tracks and switch back to camera', async () => {
        // Setup screen sharing first
        const mockStopFn = jest.fn()
        const mockTracks = [{ stop: mockStopFn }]
        const mockScreenStream = {
          getTracks: jest.fn(() => mockTracks),
          getVideoTracks: jest.fn(() => [
            { kind: 'video', stop: jest.fn(), onended: null },
          ]),
        } as any

        ;(navigator.mediaDevices.getDisplayMedia as jest.Mock).mockResolvedValue(mockScreenStream)

        const pc = await connection.setupPeerConnection('peer-123', mockLocalStream)
        const mockSender = {
          track: { kind: 'video' },
          replaceTrack: jest.fn().mockResolvedValue(undefined),
        }
        jest.spyOn(pc, 'getSenders').mockReturnValue([mockSender as any])

        await connection.startScreenShare()
        connection.stopScreenShare()

        expect(mockStopFn).toHaveBeenCalled()
      })

      it('should emit screen_share_stopped event', async () => {
        const emitSpy = jest.spyOn(connection, 'emit')

        const mockScreenStream = {
          getTracks: jest.fn(() => [{ stop: jest.fn() }]),
          getVideoTracks: jest.fn(() => [
            { kind: 'video', stop: jest.fn(), onended: null },
          ]),
        } as any

        ;(navigator.mediaDevices.getDisplayMedia as jest.Mock).mockResolvedValue(mockScreenStream)
        await connection.startScreenShare()

        connection.stopScreenShare()

        expect(emitSpy).toHaveBeenCalledWith('screen_share_stopped')
      })

      it('should handle stop when not sharing', () => {
        expect(() => connection.stopScreenShare()).not.toThrow()
      })
    })

    describe('isScreenSharing', () => {
      it('should return false initially', () => {
        expect(connection.isScreenSharing()).toBe(false)
      })

      it('should return true when screen sharing', async () => {
        const mockScreenStream = {
          getTracks: jest.fn(() => []),
          getVideoTracks: jest.fn(() => [
            { kind: 'video', stop: jest.fn(), onended: null },
          ]),
        } as any

        ;(navigator.mediaDevices.getDisplayMedia as jest.Mock).mockResolvedValue(mockScreenStream)
        await connection.startScreenShare()

        expect(connection.isScreenSharing()).toBe(true)
      })

      it('should return false after stopping', async () => {
        const mockScreenStream = {
          getTracks: jest.fn(() => [{ stop: jest.fn() }]),
          getVideoTracks: jest.fn(() => [
            { kind: 'video', stop: jest.fn(), onended: null },
          ]),
        } as any

        ;(navigator.mediaDevices.getDisplayMedia as jest.Mock).mockResolvedValue(mockScreenStream)
        await connection.startScreenShare()
        connection.stopScreenShare()

        expect(connection.isScreenSharing()).toBe(false)
      })
    })
  })
})
