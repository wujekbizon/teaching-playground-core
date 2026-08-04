import { createServer } from 'node:http'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { io as createClient, type Socket } from 'socket.io-client'
import { RealTimeCommunicationSystem } from '../src/systems/comms/RealTimeCommunicationSystem.js'
import type { User } from '../src/interfaces/user.interface.js'

type Sample = { label: string; milliseconds: number }

type ScenarioReport = {
  students: number
  connected: number
  admission: { p50: number; p95: number; max: number }
  chatFanout: { recipients: number; milliseconds: number }
  handRaiseBurst: { received: number; milliseconds: number }
  muteAllFanout: { recipients: number; milliseconds: number }
  disconnectCleanup: { participantsRemoved: number; milliseconds: number }
  eventLoopDelay: { mean: number; p95: number; max: number }
  heapGrowthMb: number
  durationMs: number
}

const args = process.argv.slice(2)
const numberArg = (name: string, fallback: number) => {
  const index = args.indexOf(name)
  return index >= 0 ? Number(args[index + 1]) : fallback
}
const students = numberArg('--students', 140)
const timeoutMs = numberArg('--timeout', 30_000)
const batchSize = numberArg('--batch-size', 20)

if (!Number.isInteger(students) || students < 1 || students > 1_000) {
  throw new Error('--students must be an integer between 1 and 1000')
}

const percentile = (values: number[], value: number) => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * value) - 1)]
}

const summarize = (samples: Sample[]) => {
  const values = samples.map(sample => sample.milliseconds)
  return {
    p50: Math.round(percentile(values, 0.5)),
    p95: Math.round(percentile(values, 0.95)),
    max: Math.round(Math.max(...values, 0)),
  }
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

const waitUntil = async (description: string, condition: () => boolean, timeout = timeoutMs) => {
  const deadline = performance.now() + timeout
  while (!condition()) {
    if (performance.now() > deadline) throw new Error(`Timed out waiting for ${description}`)
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}

async function run(): Promise<ScenarioReport> {
  const startedAt = performance.now()
  const initialHeap = process.memoryUsage().heapUsed
  const eventLoop = monitorEventLoopDelay({ resolution: 10 })
  eventLoop.enable()
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
  if (!address || typeof address === 'string') throw new Error('Load-test server did not bind to TCP')
  const url = `http://127.0.0.1:${address.port}`
  const roomId = `load-${students}-${Date.now()}`
  const clients: Socket[] = []

  const connect = async (role: 'teacher' | 'student', username: string) => {
    const beganAt = performance.now()
    const socket = createClient(url, {
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      auth: { token: `${role}:${username}` },
    })
    clients.push(socket)
    await waitForEvent(socket, 'connect')
    const admitted = waitForEvent<{ participants: unknown[] }>(socket, 'room_state')
    socket.emit('join_room', {
      roomId,
      user: { id: 'untrusted', username: 'untrusted', role, status: 'online' },
    })
    await admitted
    return { label: username, milliseconds: performance.now() - beganAt }
  }

  try {
    const teacherAdmission = await connect('teacher', 'load-teacher')
    const teacher = clients[0]
    const admissionSamples: Sample[] = [teacherAdmission]
    for (let offset = 0; offset < students; offset += batchSize) {
      const batch = Array.from({ length: Math.min(batchSize, students - offset) }, (_, index) =>
        connect('student', `student-${offset + index + 1}`))
      admissionSamples.push(...await Promise.all(batch))
    }

    let chatRecipients = 0
    for (const client of clients) client.once('new_message', () => { chatRecipients += 1 })
    const chatStarted = performance.now()
    teacher.emit('send_message', {
      roomId,
      message: { userId: 'teacher-load-teacher', username: 'load-teacher', content: 'load-test-message' },
    })
    await waitUntil('chat fanout', () => chatRecipients === clients.length)
    const chatMilliseconds = performance.now() - chatStarted

    let raisedHands = 0
    teacher.on('hand_raised', () => { raisedHands += 1 })
    const handStarted = performance.now()
    clients.slice(1).forEach((client, index) => client.emit('raise_hand', {
      roomId,
      userId: `student-student-${index + 1}`,
    }))
    await waitUntil('hand raise burst', () => raisedHands === students)
    const handMilliseconds = performance.now() - handStarted

    let muteRecipients = 0
    for (const client of clients) client.once('mute_all', () => { muteRecipients += 1 })
    const muteStarted = performance.now()
    teacher.emit('mute_all_participants', { roomId, requesterId: 'teacher-load-teacher' })
    await waitUntil('mute-all fanout', () => muteRecipients === clients.length)
    const muteMilliseconds = performance.now() - muteStarted
    const connectedBeforeDisconnect = clients.filter(client => client.connected).length

    const disconnectCount = Math.max(1, Math.ceil(students * 0.1))
    let removedParticipants = 0
    teacher.on('user_left', () => { removedParticipants += 1 })
    const disconnectStarted = performance.now()
    clients.slice(-disconnectCount).forEach(client => client.disconnect())
    await waitUntil('disconnect cleanup', () => removedParticipants === disconnectCount)
    const disconnectMilliseconds = performance.now() - disconnectStarted

    const report: ScenarioReport = {
      students,
      connected: connectedBeforeDisconnect,
      admission: summarize(admissionSamples),
      chatFanout: { recipients: chatRecipients, milliseconds: Math.round(chatMilliseconds) },
      handRaiseBurst: { received: raisedHands, milliseconds: Math.round(handMilliseconds) },
      muteAllFanout: { recipients: muteRecipients, milliseconds: Math.round(muteMilliseconds) },
      disconnectCleanup: { participantsRemoved: removedParticipants, milliseconds: Math.round(disconnectMilliseconds) },
      eventLoopDelay: {
        mean: Math.round(eventLoop.mean / 1e6),
        p95: Math.round(eventLoop.percentile(95) / 1e6),
        max: Math.round(eventLoop.max / 1e6),
      },
      heapGrowthMb: Math.round((process.memoryUsage().heapUsed - initialHeap) / 1024 / 1024 * 10) / 10,
      durationMs: Math.round(performance.now() - startedAt),
    }
    return report
  } finally {
    eventLoop.disable()
    clients.forEach(client => client.disconnect())
    await comms.shutdown()
    if (server.listening) await new Promise<void>((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve()))
  }
}

const originalLog = console.log
if (!args.includes('--verbose')) console.log = () => undefined

try {
  const report = await run()
  console.log = originalLog
  originalLog(JSON.stringify(report, null, 2))
  if (report.connected !== students + 1 ||
      report.chatFanout.recipients !== students + 1 ||
      report.handRaiseBurst.received !== students ||
      report.muteAllFanout.recipients !== students + 1) {
    process.exitCode = 1
  }
} catch (error) {
  console.log = originalLog
  console.error(error)
  process.exitCode = 1
}
