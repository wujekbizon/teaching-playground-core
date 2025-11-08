/**
 * v1.4.0: Recording Tests
 * Tests for client-side recording features using MediaRecorder API
 */

import { RoomConnection } from '../services/RoomConnection'
import { User } from '../interfaces/user.interface'
import { SystemError } from '../interfaces/errors.interface'

// Mock socket.io-client
jest.mock('socket.io-client')

// Mock MediaRecorder
class MockMediaRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive'
  ondataavailable: ((event: any) => void) | null = null
  onstop: (() => void) | null = null
  onerror: ((event: Event) => void) | null = null

  static isTypeSupported = jest.fn().mockReturnValue(true)

  constructor(public stream: MediaStream, public options?: any) {
    this.state = 'inactive'
  }

  start(timeslice?: number) {
    this.state = 'recording'
    // Simulate data available
    setTimeout(() => {
      if (this.ondataavailable) {
        this.ondataavailable({
          data: new Blob(['test data'], { type: 'video/webm' })
        })
      }
    }, 100)
  }

  stop() {
    this.state = 'inactive'
    if (this.onstop) {
      this.onstop()
    }
  }

  pause() {
    this.state = 'paused'
  }

  resume() {
    this.state = 'recording'
  }
}

// @ts-ignore
global.MediaRecorder = MockMediaRecorder

describe('RoomConnection - Recording (v1.4.0)', () => {
  let connection: RoomConnection
  let teacherUser: User
  let studentUser: User
  let mockSocket: any
  let mockStream: MediaStream

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

    // Mock MediaStream
    mockStream = {
      getTracks: jest.fn().mockReturnValue([]),
      getAudioTracks: jest.fn().mockReturnValue([]),
      getVideoTracks: jest.fn().mockReturnValue([]),
      addTrack: jest.fn(),
      removeTrack: jest.fn(),
      clone: jest.fn(),
      active: true,
      id: 'stream-123'
    } as unknown as MediaStream

    // Mock io function
    const { io } = require('socket.io-client')
    io.mockReturnValue(mockSocket)

    // Reset MediaRecorder mock
    MockMediaRecorder.isTypeSupported = jest.fn().mockReturnValue(true)
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('startRecording', () => {
    it('should start recording when teacher calls it', async () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      // Simulate connection
      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      const recordingStartedSpy = jest.fn()
      connection.on('recording_started', recordingStartedSpy)

      await connection.startRecording(mockStream)

      expect(connection.isRecording()).toBe(true)
      expect(mockSocket.emit).toHaveBeenCalledWith('recording_started', {
        roomId: 'room-1',
        teacherId: 'teacher-1'
      })
      expect(recordingStartedSpy).toHaveBeenCalledWith({
        timestamp: expect.any(String)
      })
    })

    it('should throw error when student tries to record', async () => {
      connection = new RoomConnection('room-1', studentUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      await expect(connection.startRecording(mockStream)).rejects.toThrow(SystemError)
      await expect(connection.startRecording(mockStream)).rejects.toThrow('Only teachers/admins can record lectures')
    })

    it('should throw error when not connected', async () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')

      await expect(connection.startRecording(mockStream)).rejects.toThrow(SystemError)
      await expect(connection.startRecording(mockStream)).rejects.toThrow('Cannot start recording: not connected')
    })

    it('should throw error when already recording', async () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      await connection.startRecording(mockStream)

      await expect(connection.startRecording(mockStream)).rejects.toThrow(SystemError)
      await expect(connection.startRecording(mockStream)).rejects.toThrow('Recording already in progress')
    })

    it('should throw error when no stream provided', async () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      await expect(connection.startRecording(null as any)).rejects.toThrow(SystemError)
      await expect(connection.startRecording(null as any)).rejects.toThrow('No stream available to record')
    })

    it('should use custom mimeType when provided', async () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      await connection.startRecording(mockStream, {
        mimeType: 'video/mp4',
        videoBitsPerSecond: 5000000
      })

      expect(connection.isRecording()).toBe(true)
    })

    it('should allow admin to start recording', async () => {
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

      await expect(connection.startRecording(mockStream)).resolves.not.toThrow()
    })
  })

  describe('stopRecording', () => {
    it('should stop recording and emit event with blob', async () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      const recordingStoppedSpy = jest.fn()
      connection.on('recording_stopped', recordingStoppedSpy)

      await connection.startRecording(mockStream)

      // Wait for MediaRecorder to initialize
      await new Promise(resolve => setTimeout(resolve, 50))

      connection.stopRecording()

      // Wait for onstop to fire
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(connection.isRecording()).toBe(false)
      expect(mockSocket.emit).toHaveBeenCalledWith('recording_stopped', {
        roomId: 'room-1',
        teacherId: 'teacher-1',
        duration: expect.any(Number)
      })
      expect(recordingStoppedSpy).toHaveBeenCalledWith({
        blob: expect.any(Blob),
        duration: expect.any(Number),
        size: expect.any(Number),
        mimeType: expect.any(String),
        timestamp: expect.any(String)
      })
    })

    it('should throw error when not recording', () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      expect(() => connection.stopRecording()).toThrow(SystemError)
      expect(() => connection.stopRecording()).toThrow('No recording in progress')
    })

    it('should throw error when not connected', async () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      await connection.startRecording(mockStream)

      // Disconnect
      connection.disconnect()

      expect(() => connection.stopRecording()).toThrow(SystemError)
      expect(() => connection.stopRecording()).toThrow('Cannot stop recording: not connected')
    })
  })

  describe('isRecording', () => {
    it('should return false when not recording', () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      expect(connection.isRecording()).toBe(false)
    })

    it('should return true when recording', async () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      await connection.startRecording(mockStream)

      expect(connection.isRecording()).toBe(true)
    })

    it('should return false after stopping recording', async () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      await connection.startRecording(mockStream)
      connection.stopRecording()

      expect(connection.isRecording()).toBe(false)
    })
  })

  describe('getRecordingDuration', () => {
    it('should return 0 when not recording', () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      expect(connection.getRecordingDuration()).toBe(0)
    })

    it('should return duration in seconds when recording', async () => {
      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      await connection.startRecording(mockStream)

      // Wait 1 second
      await new Promise(resolve => setTimeout(resolve, 1100))

      const duration = connection.getRecordingDuration()
      expect(duration).toBeGreaterThanOrEqual(1)
    })
  })

  describe('Event listeners', () => {
    it('should emit lecture_recording_started when received from server', () => {
      connection = new RoomConnection('room-1', studentUser, 'ws://localhost:3001')
      connection.connect()

      const lectureRecordingStartedHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'lecture_recording_started'
      )[1]

      const eventSpy = jest.fn()
      connection.on('lecture_recording_started', eventSpy)

      lectureRecordingStartedHandler({
        teacherId: 'teacher-1',
        timestamp: new Date().toISOString()
      })

      expect(eventSpy).toHaveBeenCalledWith({
        teacherId: 'teacher-1',
        timestamp: expect.any(String)
      })
    })

    it('should emit lecture_recording_stopped when received from server', () => {
      connection = new RoomConnection('room-1', studentUser, 'ws://localhost:3001')
      connection.connect()

      const lectureRecordingStoppedHandler = mockSocket.on.mock.calls.find(
        (call: any[]) => call[0] === 'lecture_recording_stopped'
      )[1]

      const eventSpy = jest.fn()
      connection.on('lecture_recording_stopped', eventSpy)

      lectureRecordingStoppedHandler({
        teacherId: 'teacher-1',
        duration: 120,
        timestamp: new Date().toISOString()
      })

      expect(eventSpy).toHaveBeenCalledWith({
        teacherId: 'teacher-1',
        duration: 120,
        timestamp: expect.any(String)
      })
    })
  })

  describe('MediaRecorder MIME type selection', () => {
    it('should select best supported MIME type', async () => {
      MockMediaRecorder.isTypeSupported = jest.fn((type: string) => {
        return type === 'video/webm;codecs=vp9,opus'
      })

      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      await connection.startRecording(mockStream)

      expect(MockMediaRecorder.isTypeSupported).toHaveBeenCalled()
      expect(connection.isRecording()).toBe(true)
    })

    it('should fall back to video/webm if no types supported', async () => {
      MockMediaRecorder.isTypeSupported = jest.fn().mockReturnValue(false)

      connection = new RoomConnection('room-1', teacherUser, 'ws://localhost:3001')
      connection.connect()

      const connectHandler = mockSocket.on.mock.calls.find((call: any[]) => call[0] === 'connect')[1]
      connectHandler()

      await connection.startRecording(mockStream)

      expect(connection.isRecording()).toBe(true)
    })
  })
})
