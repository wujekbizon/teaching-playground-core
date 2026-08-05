import { createServer } from 'node:http'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { io as createClient, type Socket } from 'socket.io-client'
import { RealTimeCommunicationSystem } from '../src/systems/comms/RealTimeCommunicationSystem.js'
import type { User } from '../src/interfaces/user.interface.js'

type EventName = 'new_message' | 'hand_raised' | 'mute_all' | 'stream_started' |
  'stream_stopped' | 'lecture_recording_started' | 'lecture_recording_stopped' | 'room_cleared'

type RoomReport = {
  roomId: string
  participants: number
  admissionMs: number
  interactionMs: number
  cleanupMs: number
  eventsVerified: number
}

const args = process.argv.slice(2)
const numberArg = (name: string, fallback: number) => {
  const index = args.indexOf(name)
  return index < 0 ? fallback : Number(args[index + 1])
}
const roomCount = numberArg('--rooms', 3)
const studentsPerRoom = numberArg('--students-per-room', 8)
const timeoutMs = numberArg('--timeout', 15_000)

if (!Number.isInteger(roomCount) || roomCount < 3 || roomCount > 20) {
  throw new Error('--rooms must be an integer between 3 and 20')
}
if (!Number.isInteger(studentsPerRoom) || studentsPerRoom < 1 || studentsPerRoom > 100) {
  throw new Error('--students-per-room must be an integer between 1 and 100')
}

const waitForEvent = <T>(socket: Socket, event: string, timeout = timeoutMs) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler)
      reject(new Error(`Timed out waiting for ${event}`))
    }, timeout)
    const handler = (payload: T) => {
      clearTimeout(timer)
      resolve(payload)
    }
    socket.once(event, handler)
  })

const waitUntil = async (description: string, condition: () => boolean) => {
  const deadline = performance.now() + timeoutMs
  while (!condition()) {
    if (performance.now() > deadline) throw new Error(`Timed out waiting for ${description}`)
    await new Promise(resolve => setTimeout(resolve, 5))
  }
}

const percentile = (values: number[], quantile: number) => {
  const sorted = [...values].sort((a, b) => a - b)
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * quantile) - 1)] ?? 0)
}

async function run() {
  const startedAt = performance.now()
  const initialHeap = process.memoryUsage().heapUsed
  const loop = monitorEventLoopDelay({ resolution: 10 })
  loop.enable()
  const server = createServer()
  const comms = new RealTimeCommunicationSystem({
    requireAuthentication: true,
    identityProvider: ({ auth }) => {
      if (typeof auth.token !== 'string') return null
      const [role, username] = auth.token.split(':', 2)
      if ((role !== 'teacher' && role !== 'student') || !username) return null
      return { id: `${role}-${username}`, username, displayName: username, role, status: 'online' } satisfies User
    },
  })
  comms.initialize(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Isolation-test server did not bind')

  const clients: Socket[] = []
  const roomClients = new Map<string, Socket[]>()
  const observed = new Map<Socket, Record<EventName, number>>()
  const roomReports: RoomReport[] = []
  const eventNames: EventName[] = ['new_message', 'hand_raised', 'mute_all', 'stream_started',
    'stream_stopped', 'lecture_recording_started', 'lecture_recording_stopped', 'room_cleared']
  const interactionEvents: EventName[] = ['new_message', 'hand_raised', 'mute_all', 'stream_started',
    'lecture_recording_started']
  const url = `http://127.0.0.1:${address.port}`

  const connect = async (roomId: string, role: 'teacher' | 'student', username: string) => {
    const socket = createClient(url, {
      transports: ['websocket'], reconnection: false, forceNew: true, auth: { token: `${role}:${username}` },
    })
    clients.push(socket)
    const counts = Object.fromEntries(eventNames.map(event => [event, 0])) as Record<EventName, number>
    observed.set(socket, counts)
    eventNames.forEach(event => socket.on(event, () => { counts[event] += 1 }))
    await waitForEvent(socket, 'connect')
    const state = waitForEvent<{ participants: Array<{ username: string }> }>(socket, 'room_state')
    socket.emit('join_room', { roomId })
    return { socket, state: await state }
  }

  try {
    for (let roomIndex = 0; roomIndex < roomCount; roomIndex += 1) {
      const roomId = `isolation-${roomIndex + 1}-${Date.now()}`
      const admissionStarted = performance.now()
      const teacher = await connect(roomId, 'teacher', `teacher-${roomIndex + 1}`)
      const students = await Promise.all(Array.from({ length: studentsPerRoom }, (_, studentIndex) =>
        connect(roomId, 'student', `room-${roomIndex + 1}-student-${studentIndex + 1}`)))
      const sockets = [teacher.socket, ...students.map(result => result.socket)]
      roomClients.set(roomId, sockets)
      const finalState = students.at(-1)?.state
      if (finalState?.participants.length !== sockets.length ||
          finalState.participants.some(participant => !participant.username.includes(`room-${roomIndex + 1}-`) &&
            participant.username !== `teacher-${roomIndex + 1}`)) {
        throw new Error(`Participant state leaked into ${roomId}`)
      }
      roomReports.push({ roomId, participants: sockets.length,
        admissionMs: Math.round(performance.now() - admissionStarted), interactionMs: 0, cleanupMs: 0,
        eventsVerified: 0 })
    }

    for (const report of roomReports) {
      const sockets = roomClients.get(report.roomId)!
      const teacher = sockets[0]
      const student = sockets[1]
      const before = new Map(clients.map(client => [client, { ...observed.get(client)! }]))
      const interactionStarted = performance.now()
      teacher.emit('send_message', { roomId: report.roomId, message: { content: `message-${report.roomId}` } })
      student.emit('raise_hand', { roomId: report.roomId, userId: 'ignored' })
      teacher.emit('mute_all_participants', { roomId: report.roomId, requesterId: 'ignored' })
      teacher.emit('start_stream', { roomId: report.roomId, username: 'ignored', quality: 'high' })
      teacher.emit('recording_started', { roomId: report.roomId, teacherId: 'ignored' })
      await waitUntil(`${report.roomId} event fan-out`, () =>
        sockets.every(socket => interactionEvents.every(event => observed.get(socket)![event] > before.get(socket)![event])))
      teacher.emit('recording_stopped', { roomId: report.roomId, teacherId: 'ignored', duration: 1 })
      teacher.emit('stop_stream', report.roomId)
      await waitUntil(`${report.roomId} stop fan-out`, () => sockets.every(socket =>
        observed.get(socket)!.lecture_recording_stopped > before.get(socket)!.lecture_recording_stopped &&
        observed.get(socket)!.stream_stopped > before.get(socket)!.stream_stopped))
      const outsiders = clients.filter(client => !sockets.includes(client))
      for (const outsider of outsiders) {
        for (const event of eventNames.filter(event => event !== 'room_cleared')) {
          if (observed.get(outsider)![event] !== before.get(outsider)![event]) {
            throw new Error(`${event} leaked from ${report.roomId} to another room`)
          }
        }
      }
      report.interactionMs = Math.round(performance.now() - interactionStarted)
      report.eventsVerified = 7
    }

    for (const report of roomReports) {
      const sockets = roomClients.get(report.roomId)!
      const outsiders = clients.filter(client => !sockets.includes(client))
      const outsiderCounts = outsiders.map(socket => observed.get(socket)!.room_cleared)
      const cleanupStarted = performance.now()
      comms.clearRoom(report.roomId)
      await waitUntil(`${report.roomId} cleanup`, () => sockets.every(socket => observed.get(socket)!.room_cleared === 1))
      if (outsiders.some((socket, index) => observed.get(socket)!.room_cleared !== outsiderCounts[index])) {
        throw new Error(`Cleanup leaked from ${report.roomId} to another room`)
      }
      report.cleanupMs = Math.round(performance.now() - cleanupStarted)
      report.eventsVerified += 1
    }

    const interactionValues = roomReports.map(report => report.interactionMs)
    return {
      configuration: { rooms: roomCount, studentsPerRoom },
      totals: { participants: clients.length, eventsVerified: roomReports.reduce((sum, room) => sum + room.eventsVerified, 0) },
      rooms: roomReports,
      aggregate: {
        interactionLatencyMs: { p50: percentile(interactionValues, 0.5), p95: percentile(interactionValues, 0.95), max: Math.max(...interactionValues) },
        eventLoopDelayMs: { mean: Math.round(loop.mean / 1e6), p95: Math.round(loop.percentile(95) / 1e6), max: Math.round(loop.max / 1e6) },
        heapGrowthMb: Math.round((process.memoryUsage().heapUsed - initialHeap) / 1024 / 1024 * 10) / 10,
        durationMs: Math.round(performance.now() - startedAt),
      },
      isolationPassed: true,
    }
  } finally {
    loop.disable()
    clients.forEach(client => client.disconnect())
    await comms.shutdown()
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
}

const originalLog = console.log
if (!args.includes('--verbose')) console.log = () => undefined
try {
  const report = await run()
  console.log = originalLog
  originalLog(JSON.stringify(report, null, 2))
} catch (error) {
  console.log = originalLog
  console.error(error)
  process.exitCode = 1
}
