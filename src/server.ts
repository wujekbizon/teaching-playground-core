import { createServer } from 'http'
import { pathToFileURL } from 'url'
import { RealTimeCommunicationSystem } from './systems/comms/RealTimeCommunicationSystem'
import type { User } from './interfaces/user.interface'
import TeachingPlayground from './engine/TeachingPlayground'
import { SystemError } from './interfaces/errors.interface'
import { buildTurnConfiguration } from './utils/TurnConfig'

const readJson = (req: import('http').IncomingMessage) => new Promise<Record<string, any>>((resolve, reject) => {
  let body = ''
  req.on('data', chunk => { body += chunk; if (body.length > 1_000_000) reject(new Error('Request body too large')) })
  req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}) } catch (error) { reject(error) } })
  req.on('error', reject)
})

function getAllowedOrigins(): string[] {
  const configured = process.env.ALLOWED_ORIGINS || process.env.NEXT_PUBLIC_WS_URL
  return configured
    ? configured.split(',').map(origin => origin.trim()).filter(Boolean)
    : ['http://localhost:3000', 'http://localhost:5173']
}

function resolveDevelopmentIdentity(token: unknown): User | null {
  if (typeof token !== 'string') return null
  const [role, identity = role] = token.split(':', 2)
  if (role !== 'teacher' && role !== 'student' && role !== 'admin') return null
  return {
    id: `dev-${role}-${identity}`,
    username: identity,
    displayName: identity,
    organizationId: 'school-demo',
    role,
    status: 'online'
  }
}

// Environment variable validation
function validateEnvironment() {
  const warnings: string[] = []
  const errors: string[] = []

  // Check PORT
  if (process.env.PORT) {
    const port = parseInt(process.env.PORT)
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push(`Invalid PORT: ${process.env.PORT}. Must be a number between 1 and 65535.`)
    }
  } else {
    warnings.push('PORT not set. Using default: 3001')
  }

  // Check NEXT_PUBLIC_WS_URL (optional but recommended)
  if (process.env.NEXT_PUBLIC_WS_URL) {
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL
    if (!wsUrl.match(/^https?:\/\/.+/)) {
      errors.push(`Invalid NEXT_PUBLIC_WS_URL format: ${wsUrl}. Must start with http:// or https://`)
    }
  } else {
    warnings.push('NEXT_PUBLIC_WS_URL not set. Using default: http://localhost:3000')
  }

  // Check NODE_ENV
  if (!process.env.NODE_ENV) {
    warnings.push('NODE_ENV not set. Assuming development mode.')
  }

  // Check ALLOWED_ORIGINS
  if (!process.env.ALLOWED_ORIGINS) {
    warnings.push('ALLOWED_ORIGINS not set. Using localhost development origins.')
  }

  // Log warnings
  if (warnings.length > 0) {
    console.warn('⚠️  Environment warnings:')
    warnings.forEach(warning => console.warn(`  - ${warning}`))
    console.warn('  Consider creating a .env file. See .env.example for reference.')
  }

  // Log errors and exit if any
  if (errors.length > 0) {
    console.error('❌ Environment configuration errors:')
    errors.forEach(error => console.error(`  - ${error}`))
    console.error('\n  Please check your .env file or environment variables.')
    console.error('  See .env.example for reference.')
    process.exit(1)
  }

  if (warnings.length === 0 && errors.length === 0) {
    console.log('✅ Environment configuration validated successfully')
  }
}

// Validate environment variables on module load
validateEnvironment()

export async function startWebSocketServer(port: number = 3001) {
  try {
    console.log('Starting Teaching Playground WebSocket Server...')
    const developmentAuth = process.env.DEV_AUTH_ENABLED === 'true'
    if (developmentAuth && process.env.NODE_ENV === 'production') {
      throw new Error('DEV_AUTH_ENABLED cannot be used in production')
    }

    const scheduling = developmentAuth ? new TeachingPlayground({ commsConfig: {
      allowedOrigins: getAllowedOrigins(), requireAuthentication: true, identityProvider: ({ auth }) => resolveDevelopmentIdentity(auth.token),
    } }) : null
    scheduling?.setCurrentUser({ id: 'dev-admin', organizationId: 'school-demo',
      username: 'Harness administrator', displayName: 'Harness administrator', role: 'admin', status: 'online' })
    const server = createServer((req, res) => {
      const origin = req.headers.origin
      if (origin && getAllowedOrigins().includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

      const respond = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(body))
      }
      const handleApi = async () => {
        if (!scheduling || !req.url?.startsWith('/api/')) return false
        const url = new URL(req.url, 'http://localhost')
        if (url.pathname === '/api/turn' && req.method === 'GET') respond(200, buildTurnConfiguration())
        else if (url.pathname === '/api/rooms' && req.method === 'GET') respond(200, await scheduling.listRooms())
        else if (url.pathname === '/api/rooms' && req.method === 'POST') respond(201, await scheduling.createRoom(await readJson(req) as any))
        else if (url.pathname === '/api/reservations' && req.method === 'GET') respond(200, await scheduling.listReservations({
          roomId: url.searchParams.get('roomId') ?? undefined,
          status: url.searchParams.get('status') as any ?? undefined,
          from: url.searchParams.get('from') ?? undefined,
          to: url.searchParams.get('to') ?? undefined,
          programId: url.searchParams.get('programId') ?? undefined,
          curriculumId: url.searchParams.get('curriculumId') ?? undefined,
          termId: url.searchParams.get('termId') ?? undefined,
          courseId: url.searchParams.get('courseId') ?? undefined,
          subjectId: url.searchParams.get('subjectId') ?? undefined,
          cohortId: url.searchParams.get('cohortId') ?? undefined,
        }))
        else if (url.pathname === '/api/reservations' && req.method === 'POST') respond(201, await scheduling.scheduleReservation(await readJson(req) as any))
        else if (url.pathname === '/api/availability' && req.method === 'GET') respond(200, await scheduling.getRoomAvailability({
          startsAt: url.searchParams.get('startsAt') ?? '', endsAt: url.searchParams.get('endsAt') ?? '',
          capacity: url.searchParams.has('capacity') ? Number(url.searchParams.get('capacity')) : undefined,
          excludeReservationId: url.searchParams.get('excludeReservationId') ?? undefined,
        }))
        else {
          const cancelMatch = url.pathname.match(/^\/api\/reservations\/([^/]+)\/cancel$/)
          const rescheduleMatch = url.pathname.match(/^\/api\/reservations\/([^/]+)\/reschedule$/)
          const maintenanceMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)\/maintenance$/)
          if (cancelMatch && req.method === 'POST') respond(200, await scheduling.cancelReservation(decodeURIComponent(cancelMatch[1])))
          else if (rescheduleMatch && req.method === 'POST') respond(200, await scheduling.rescheduleLecture(decodeURIComponent(rescheduleMatch[1]), await readJson(req) as any))
          else if (maintenanceMatch && req.method === 'POST') {
            const body = await readJson(req)
            respond(200, await scheduling.setRoomMaintenance(decodeURIComponent(maintenanceMatch[1]), body.enabled === true))
          } else return false
        }
        return true
      }
      void handleApi().then(handled => {
        if (!handled && !res.headersSent) { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('Teaching Playground WebSocket Server') }
      }).catch(error => {
        const systemError = error instanceof SystemError ? error : new SystemError('INTERNAL_ERROR', error instanceof Error ? error.message : 'Request failed')
        if (!res.headersSent) respond(systemError.code === 'RESERVATION_CONFLICT' ? 409 : 400, {
          code: systemError.code, message: systemError.message, details: systemError.details,
        })
      })
    })

    const commsSystem = scheduling ? null : new RealTimeCommunicationSystem({ allowedOrigins: getAllowedOrigins() })
    if (scheduling) scheduling.initialize(server)
    else commsSystem!.initialize(server)

    server.listen(port, () => {
      console.log(`WebSocket server is running on port ${port}`)
      console.log(`HTTP endpoint: http://localhost:${port}`)
      console.log(`WebSocket endpoint: ws://localhost:${port}`)
      console.log('Waiting for connections...')
    })

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`${signal} received. Shutting down gracefully...`)
      if (scheduling) await scheduling.shutdown()
      else await commsSystem!.shutdown()
      if (server.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close(error => error ? reject(error) : resolve())
        })
      }
      console.log('Server closed')
    }

    process.once('SIGTERM', () => {
      void shutdown('SIGTERM').then(() => process.exit(0), () => process.exit(1))
    })

    process.once('SIGINT', () => {
      void shutdown('SIGINT').then(() => process.exit(0), () => process.exit(1))
    })

    return server
  } catch (err) {
    console.error('Error starting WebSocket server:', err)
    process.exit(1)
  }
}

// Allow running directly with node/tsx
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void (async () => {
    const port = parseInt(process.env.PORT || '3001', 10);
    await startWebSocketServer(port);
  })()
}
