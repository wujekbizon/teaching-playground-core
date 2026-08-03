import { createServer, Server as HttpServer } from 'http'
import { AddressInfo } from 'net'
import { io as createClient, Socket as ClientSocket } from 'socket.io-client'
import { RoomConnection } from '../services/RoomConnection'
import { RealTimeCommunicationSystem } from '../systems/comms/RealTimeCommunicationSystem'
import { User } from '../interfaces/user.interface'

const createPeerConnection = () => ({
  createOffer: jest.fn().mockResolvedValue({ type: 'offer', sdp: 'test-offer' }),
  createAnswer: jest.fn().mockResolvedValue({ type: 'answer', sdp: 'test-answer' }),
  setLocalDescription: jest.fn().mockResolvedValue(undefined),
  setRemoteDescription: jest.fn().mockResolvedValue(undefined),
  addIceCandidate: jest.fn().mockResolvedValue(undefined),
  addTrack: jest.fn(),
  getSenders: jest.fn(() => []),
  close: jest.fn(),
  localDescription: { type: 'offer', sdp: 'test-offer' },
  remoteDescription: null,
  connectionState: 'new',
  ontrack: null,
  onicecandidate: null,
  onconnectionstatechange: null,
})

describe('RoomConnection server signaling contract', () => {
  let server: HttpServer
  let comms: RealTimeCommunicationSystem
  let student: ClientSocket | undefined
  let teacher: RoomConnection | undefined

  beforeEach(async () => {
    global.RTCPeerConnection = jest.fn().mockImplementation(createPeerConnection) as any
    global.RTCSessionDescription = jest.fn(value => value) as any
    global.RTCIceCandidate = jest.fn(value => value) as any
    server = createServer()
    comms = new RealTimeCommunicationSystem()
    comms.initialize(server)
    await new Promise<void>(resolve => server.listen(0, resolve))
  })

  afterEach(async () => {
    teacher?.disconnect()
    student?.disconnect()
    await comms.shutdown()
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  })

  it('relays an SDK offer through the real server with room membership validation', async () => {
    const { port } = server.address() as AddressInfo
    const url = `http://127.0.0.1:${port}`
    const roomId = 'signaling-room'
    const teacherUser: User = { id: 'teacher-1', username: 'teacher', role: 'teacher', status: 'online' }
    const studentUser: User = { id: 'student-1', username: 'student', role: 'student', status: 'online' }

    student = createClient(url, { transports: ['websocket'], reconnection: false })
    await new Promise<void>(resolve => student!.once('connect', () => resolve()))
    const studentJoined = new Promise<void>(resolve => student!.once('room_state', () => resolve()))
    student.emit('join_room', { roomId, user: studentUser })
    await studentJoined

    teacher = new RoomConnection(roomId, teacherUser, url)
    const teacherJoined = new Promise<void>(resolve => teacher!.once('connected', () => resolve()))
    teacher.connect()
    await teacherJoined

    await teacher.setupPeerConnection(student.id!, null)
    const relayedOffer = new Promise<any>(resolve => student!.once('webrtc:offer', resolve))
    await teacher.createOffer(student.id!)

    await expect(relayedOffer).resolves.toMatchObject({
      offer: { type: 'offer', sdp: 'test-offer' },
    })
  })

  it('re-emits room admission errors to SDK consumers', async () => {
    const { port } = server.address() as AddressInfo
    const roomId = 'closed-room'
    comms.registerLecture('lecture-1', roomId, 'completed')
    teacher = new RoomConnection(roomId, {
      id: 'teacher-1', username: 'teacher', role: 'teacher', status: 'online'
    }, `http://127.0.0.1:${port}`)

    const admissionError = new Promise<any>(resolve => teacher!.once('join_room_error', resolve))
    teacher.connect()

    await expect(admissionError).resolves.toMatchObject({
      code: 'ROOM_UNAVAILABLE',
      lectureStatus: 'completed',
      roomId,
    })
  })
})
