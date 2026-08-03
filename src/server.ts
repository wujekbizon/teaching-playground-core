import { createServer } from 'http'
import { pathToFileURL } from 'url'
import { RealTimeCommunicationSystem } from './systems/comms/RealTimeCommunicationSystem'
import type { User } from './interfaces/user.interface'

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
    
    const server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('Teaching Playground WebSocket Server')
    })

    const developmentAuth = process.env.DEV_AUTH_ENABLED === 'true'
    if (developmentAuth && process.env.NODE_ENV === 'production') {
      throw new Error('DEV_AUTH_ENABLED cannot be used in production')
    }

    const commsSystem = new RealTimeCommunicationSystem({
      allowedOrigins: getAllowedOrigins(),
      requireAuthentication: developmentAuth,
      identityProvider: developmentAuth
        ? ({ auth }) => resolveDevelopmentIdentity(auth.token)
        : undefined
    })
    
    commsSystem.initialize(server)

    server.listen(port, () => {
      console.log(`WebSocket server is running on port ${port}`)
      console.log(`HTTP endpoint: http://localhost:${port}`)
      console.log(`WebSocket endpoint: ws://localhost:${port}`)
      console.log('Waiting for connections...')
    })

    // Handle graceful shutdown
    const shutdown = async (signal: string) => {
      console.log(`${signal} received. Shutting down gracefully...`)
      await commsSystem.shutdown()
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
