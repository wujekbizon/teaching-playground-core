import { CommsConfig, SystemError } from '../../interfaces'
import { Server as SocketIOServer } from 'socket.io'
import { Server as HttpServer } from 'http'
import { EventEmitter } from 'events'

interface RoomMessage {
  userId: string
  username: string
  content: string
  timestamp: string
}

interface StreamState {
  isActive: boolean
  streamerId: string | null
  quality: 'low' | 'medium' | 'high'
}

export class RealTimeCommunicationSystem extends EventEmitter {
  private io: SocketIOServer | null = null
  private rooms: Map<string, Set<string>> = new Map() // roomId -> Set of connected socketIds
  private streams: Map<string, StreamState> = new Map() // roomId -> stream state
  private messages: Map<string, RoomMessage[]> = new Map() // roomId -> messages

  constructor(private config?: CommsConfig) {
    super()
  }

  initialize(server: HttpServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: this.config?.allowedOrigins || "*",
        methods: ["GET", "POST"]
      },
      pingTimeout: 10000,
      pingInterval: 5000
    })

    this.setupEventHandlers()
    console.log('RealTimeCommunicationSystem initialized')
  }

  private setupEventHandlers() {
    if (!this.io) throw new SystemError('COMMS_NOT_INITIALIZED', 'Communication system not initialized')

    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`)

      // Room events
      socket.on('join_room', (roomId: string, userId: string) => {
        this.handleJoinRoom(socket, roomId, userId)
      })

      socket.on('leave_room', (roomId: string) => {
        this.handleLeaveRoom(socket, roomId)
      })

      // Chat events
      socket.on('send_message', (roomId: string, message: Omit<RoomMessage, 'timestamp'>) => {
        this.handleMessage(socket, roomId, message)
      })

      // Stream events
      socket.on('start_stream', (roomId: string, userId: string, quality: StreamState['quality']) => {
        this.handleStartStream(socket, roomId, userId, quality)
      })

      socket.on('stop_stream', (roomId: string) => {
        this.handleStopStream(socket, roomId)
      })

      socket.on('disconnect', () => {
        this.handleDisconnect(socket)
      })
    })
  }

  private handleJoinRoom(socket: any, roomId: string, userId: string) {
    try {
      socket.join(roomId)
      
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, new Set())
      }
      this.rooms.get(roomId)!.add(socket.id)

      // Send room state to the joining user
      socket.emit('room_state', {
        stream: this.streams.get(roomId) || { isActive: false, streamerId: null },
        participants: Array.from(this.rooms.get(roomId) || []),
        messages: this.messages.get(roomId) || []
      })

      // Notify others
      socket.to(roomId).emit('user_joined', { userId, socketId: socket.id })
    } catch (error) {
      console.error('Error in handleJoinRoom:', error)
      socket.emit('error', { message: 'Failed to join room' })
    }
  }

  private handleLeaveRoom(socket: any, roomId: string) {
    try {
      socket.leave(roomId)
      this.rooms.get(roomId)?.delete(socket.id)
      socket.to(roomId).emit('user_left', { socketId: socket.id })
    } catch (error) {
      console.error('Error in handleLeaveRoom:', error)
    }
  }

  private handleMessage(socket: any, roomId: string, message: Omit<RoomMessage, 'timestamp'>) {
    try {
      const fullMessage: RoomMessage = {
        ...message,
        timestamp: new Date().toISOString()
      }

      if (!this.messages.has(roomId)) {
        this.messages.set(roomId, [])
      }
      this.messages.get(roomId)!.push(fullMessage)

      // Limit message history
      if (this.messages.get(roomId)!.length > 100) {
        this.messages.get(roomId)!.shift()
      }

      this.io!.to(roomId).emit('new_message', fullMessage)
    } catch (error) {
      console.error('Error in handleMessage:', error)
      socket.emit('error', { message: 'Failed to send message' })
    }
  }

  private handleStartStream(socket: any, roomId: string, userId: string, quality: StreamState['quality']) {
    try {
      const streamState: StreamState = {
        isActive: true,
        streamerId: userId,
        quality
      }
      this.streams.set(roomId, streamState)
      this.io!.to(roomId).emit('stream_started', streamState)
    } catch (error) {
      console.error('Error in handleStartStream:', error)
      socket.emit('error', { message: 'Failed to start stream' })
    }
  }

  private handleStopStream(socket: any, roomId: string) {
    try {
      this.streams.delete(roomId)
      this.io!.to(roomId).emit('stream_stopped')
    } catch (error) {
      console.error('Error in handleStopStream:', error)
      socket.emit('error', { message: 'Failed to stop stream' })
    }
  }

  private handleDisconnect(socket: any) {
    try {
      // Remove socket from all rooms
      this.rooms.forEach((sockets, roomId) => {
        if (sockets.has(socket.id)) {
          sockets.delete(socket.id)
          this.io!.to(roomId).emit('user_left', { socketId: socket.id })
        }
      })
    } catch (error) {
      console.error('Error in handleDisconnect:', error)
    }
  }

  setupForRoom(roomId: string): void {
    try {
      if (!this.io) throw new SystemError('COMMS_NOT_INITIALIZED', 'Communication system not initialized')
      
      this.rooms.set(roomId, new Set())
      this.messages.set(roomId, [])
      console.log(`Communication setup for room: ${roomId}`)
    } catch (error) {
      throw new SystemError('COMMUNICATION_SETUP_FAILED', 'Failed to setup room communication')
    }
  }

  allocateResources(eventId: string): void {
    try {
      // Resources are automatically allocated when users join the room
      console.log(`Resources allocated for event: ${eventId}`)
    } catch (error) {
      throw new SystemError('RESOURCE_ALLOCATION_FAILED', 'Failed to allocate resources')
    }
  }

  async deallocateResources(eventId: string): Promise<void> {
    try {
      // Clean up room resources
      this.rooms.delete(eventId)
      this.streams.delete(eventId)
      this.messages.delete(eventId)
      
      if (this.io) {
        const sockets = await this.io.in(eventId).fetchSockets()
        sockets.forEach(socket => socket.leave(eventId))
      }
      
      console.log(`Resources deallocated for event: ${eventId}`)
    } catch (error) {
      throw new SystemError('RESOURCE_DEALLOCATION_FAILED', 'Failed to deallocate resources')
    }
  }

  async getResourceStatus(eventId: string) {
    try {
      const hasRoom = this.rooms.has(eventId)
      const stream = this.streams.get(eventId)
      
      return {
        websocket: hasRoom,
        webrtc: !!stream?.isActive,
        resources: {
          allocated: hasRoom,
          type: 'lecture',
        },
      }
    } catch (error) {
      throw new SystemError('RESOURCE_STATUS_FAILED', 'Failed to get resource status')
    }
  }
}
