import { createServer } from 'http'
import { RealTimeCommunicationSystem } from './systems/comms/RealTimeCommunicationSystem'

export async function startWebSocketServer(port: number = 3001) {
  try {
    console.log('Starting Teaching Playground WebSocket Server...')
    
    const server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end('Teaching Playground WebSocket Server')
    })

    const commsSystem = new RealTimeCommunicationSystem({
      allowedOrigins: process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3000"
    })
    
    commsSystem.initialize(server)

    server.listen(port, () => {
      console.log(`✨ WebSocket server is running on port ${port}`)
      console.log(`🔗 HTTP endpoint: http://localhost:${port}`)
      console.log(`🚀 WebSocket endpoint: ws://localhost:${port}`)
      console.log('👥 Waiting for connections...')
    })

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM received. Shutting down gracefully...')
      server.close(() => {
        console.log('Server closed')
        process.exit(0)
      })
    })

    process.on('SIGINT', () => {
      console.log('SIGINT received. Shutting down gracefully...')
      server.close(() => {
        console.log('Server closed')
        process.exit(0)
      })
    })

    return server
  } catch (err) {
    console.error('Error starting WebSocket server:', err)
    process.exit(1)
  }
}

// Allow running directly with node/tsx
(async () => {
  if (import.meta.url === new URL(import.meta.url).href) {
    const port = parseInt(process.env.PORT || '3001', 10);
    await startWebSocketServer(port);
  }
})();
