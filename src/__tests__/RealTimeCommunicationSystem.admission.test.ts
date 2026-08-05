import { createServer, type Server } from 'http'
import { io as createClient, type Socket } from 'socket.io-client'
import { RealTimeCommunicationSystem } from '../systems/comms/RealTimeCommunicationSystem'
import type { User } from '../interfaces'

describe('reservation admission enforcement', () => {
  let server: Server
  let comms: RealTimeCommunicationSystem
  let url: string
  const clients: Socket[] = []

  beforeEach(async () => {
    server = createServer()
    comms = new RealTimeCommunicationSystem({ requireAuthentication: true, identityProvider: ({ auth }) => ({
      id: String(auth.token), organizationId: String(auth.organizationId ?? 'school-a'), username: String(auth.token), role: 'student', status: 'online',
    } satisfies User) })
    comms.initialize(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Server failed to bind')
    url = `http://127.0.0.1:${address.port}`
  })

  afterEach(async () => {
    clients.forEach(client => client.disconnect())
    await comms.shutdown()
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()))
  })

  const join = async (token: string, roomId: string, reservationId?: string, organizationId = 'school-a') => {
    const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false, auth: { token, organizationId } })
    clients.push(socket)
    await new Promise<void>(resolve => socket.once('connect', () => resolve()))
    const result = new Promise<{ event: string; payload: any }>(resolve => {
      socket.once('room_state', payload => resolve({ event: 'room_state', payload }))
      socket.once('join_room_error', payload => resolve({ event: 'join_room_error', payload }))
    })
    socket.emit('join_room', { roomId, reservationId })
    return result
  }

  it('admits open reservations up to capacity and rejects the next participant', async () => {
    comms.registerLecture('lecture-1', 'room-1', 'open', 2)
    await expect(join('student-1', 'room-1')).resolves.toMatchObject({ event: 'room_state' })
    await expect(join('student-2', 'room-1')).resolves.toMatchObject({ event: 'room_state' })
    await expect(join('student-3', 'room-1')).resolves.toMatchObject({
      event: 'join_room_error', payload: { code: 'ROOM_CAPACITY_EXCEEDED' },
    })
  })

  it('rejects admission before the early-admission window opens', async () => {
    comms.registerLecture('lecture-1', 'room-1', 'scheduled', 2)
    await expect(join('student-1', 'room-1')).resolves.toMatchObject({
      event: 'join_room_error', payload: { code: 'ROOM_UNAVAILABLE', lectureStatus: 'scheduled' },
    })
  })

  it('requires the room claim reservation and organization to match', async () => {
    comms.registerLecture('lecture-1', 'room-1', 'open', 2, 'school-a')
    await expect(join('student-1', 'room-1', 'wrong')).resolves.toMatchObject({
      event: 'join_room_error', payload: { code: 'ROOM_UNAVAILABLE' },
    })
    await expect(join('student-2', 'room-1', 'lecture-1', 'school-b')).resolves.toMatchObject({
      event: 'join_room_error', payload: { code: 'ORGANIZATION_MISMATCH' },
    })
    await expect(join('student-3', 'room-1', 'lecture-1')).resolves.toMatchObject({ event: 'room_state' })
  })

  it('disconnects the previous cohort when the lecture room is cleared', async () => {
    comms.registerLecture('lecture-1', 'room-1', 'open', 2)
    await join('student-1', 'room-1')
    const client = clients.at(-1)!
    const disconnected = new Promise<void>(resolve => client.once('disconnect', () => resolve()))
    comms.clearRoom('room-1')
    await expect(disconnected).resolves.toBeUndefined()
    expect(client.connected).toBe(false)
    expect(comms.getRoomParticipants('room-1')).toEqual([])
  })
})

describe('host-owned launch claims', () => {
  it('rejects requireLaunchClaims configuration without a host verifier', () => {
    const invalid = new RealTimeCommunicationSystem({ requireLaunchClaims: true })
    expect(() => invalid.initialize(createServer())).toThrow('A launchClaimVerifier is required when requireLaunchClaims is enabled')
  })

  let server: Server
  let comms: RealTimeCommunicationSystem
  let url: string
  const clients: Socket[] = []

  beforeEach(async () => {
    server = createServer()
    comms = new RealTimeCommunicationSystem({
      requireAuthentication: true,
      requireLaunchClaims: true,
      identityProvider: ({ auth }) => ({
        id: String(auth.token), organizationId: 'school-a', username: String(auth.token), role: 'student', status: 'online',
      } satisfies User),
      launchClaimVerifier: ({ claims }) => claims as any,
    })
    comms.initialize(server)
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Server failed to bind')
    url = `http://127.0.0.1:${address.port}`
    comms.registerLecture('lecture-1', 'room-1', 'open', 2, 'school-a')
  })

  afterEach(async () => {
    clients.forEach(client => client.disconnect())
    await comms.shutdown()
    if (server.listening) await new Promise<void>(resolve => server.close(() => resolve()))
  })

  const joinWithClaims = async (token: string, launchClaims?: unknown) => {
    const socket = createClient(url, { transports: ['websocket'], forceNew: true, reconnection: false, auth: { token } })
    clients.push(socket)
    await new Promise<void>(resolve => socket.once('connect', () => resolve()))
    const result = new Promise<{ event: string; payload: any }>(resolve => {
      socket.once('room_state', payload => resolve({ event: 'room_state', payload }))
      socket.once('join_room_error', payload => resolve({ event: 'join_room_error', payload }))
    })
    socket.emit('join_room', { roomId: 'room-1', reservationId: 'lecture-1', launchClaims })
    return result
  }

  it('requires verified host launch claims before runtime reservation admission', async () => {
    await expect(joinWithClaims('student-1')).resolves.toMatchObject({
      event: 'join_room_error', payload: { code: 'LAUNCH_CLAIMS_REQUIRED' },
    })
    await expect(joinWithClaims('student-1', {
      provider: 'wolfmed', allowed: true, organizationId: 'school-a', userId: 'student-1', roomId: 'room-1',
      reservationId: 'lecture-1', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })).resolves.toMatchObject({ event: 'room_state' })
  })

  it('rejects host launch claims that do not match the user or validity window', async () => {
    await expect(joinWithClaims('student-1', {
      provider: 'wolfmed', allowed: true, organizationId: 'school-a', userId: 'other-student', roomId: 'room-1',
      reservationId: 'lecture-1', expiresAt: new Date(Date.now() + 60_000).toISOString(),
    })).resolves.toMatchObject({ event: 'join_room_error', payload: { code: 'LAUNCH_CLAIMS_INVALID' } })
    await expect(joinWithClaims('student-2', {
      provider: 'wolfmed', allowed: true, organizationId: 'school-a', userId: 'student-2', roomId: 'room-1',
      reservationId: 'lecture-1', expiresAt: new Date(Date.now() - 60_000).toISOString(),
    })).resolves.toMatchObject({ event: 'join_room_error', payload: { code: 'LAUNCH_CLAIMS_EXPIRED' } })
  })
})
