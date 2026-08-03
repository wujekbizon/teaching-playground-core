import { createServer, Server as HttpServer } from 'http'
import { AddressInfo } from 'net'
import { io as createClient, Socket as ClientSocket } from 'socket.io-client'
import { RealTimeCommunicationSystem } from '../systems/comms/RealTimeCommunicationSystem'
import { User } from '../interfaces/user.interface'

const users: Record<string, User> = {
  teacher: { id: 'teacher-1', username: 'teacher', role: 'teacher', status: 'online' },
  student: { id: 'student-1', username: 'student', role: 'student', status: 'online' },
}

describe('RealTimeCommunicationSystem authenticated identity', () => {
  let server: HttpServer
  let comms: RealTimeCommunicationSystem
  const clients: ClientSocket[] = []

  beforeEach(async () => {
    server = createServer()
    comms = new RealTimeCommunicationSystem({
      requireAuthentication: true,
      identityProvider: ({ auth }) => users[String(auth.token)] ?? null,
    })
    comms.initialize(server)
    await new Promise<void>((resolve) => server.listen(0, resolve))
  })

  afterEach(async () => {
    clients.forEach((client) => client.disconnect())
    clients.length = 0
    await comms.shutdown()
    if (server.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve())
      )
    }
  })

  const connect = (token: string): Promise<ClientSocket> => {
    const { port } = server.address() as AddressInfo
    const client = createClient(`http://127.0.0.1:${port}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    })
    clients.push(client)
    return new Promise((resolve, reject) => {
      client.once('connect', () => resolve(client))
      client.once('connect_error', reject)
    })
  }

  it('rejects a socket whose credentials cannot be resolved', async () => {
    await expect(connect('invalid')).rejects.toThrow('UNAUTHORIZED')
  })

  it('uses authenticated identity instead of join and requester claims', async () => {
    const teacher = await connect('teacher')
    const student = await connect('student')
    const roomId = 'secured-room'

    const joined = Promise.all([
      new Promise<void>((resolve) => teacher.once('room_state', () => resolve())),
      new Promise<void>((resolve) => student.once('room_state', () => resolve())),
    ])
    teacher.emit('join_room', { roomId, user: users.student })
    student.emit('join_room', { roomId, user: users.teacher })
    await joined

    const error = new Promise<{ message: string }>((resolve) => student.once('error', resolve))
    student.emit('mute_all_participants', { roomId, requesterId: users.teacher.id })

    await expect(error).resolves.toMatchObject({
      message: 'Only teachers/admins can mute all participants',
    })

    expect(comms.getRoomParticipants(roomId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: users.teacher.id, role: 'teacher' }),
        expect.objectContaining({ id: users.student.id, role: 'student' }),
      ])
    )
  })
})
