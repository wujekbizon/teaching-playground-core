import { CommsConfig, SystemError } from '../../interfaces'
import { Server as SocketIOServer } from 'socket.io'
import { Server as HttpServer } from 'http'
import { EventEmitter } from 'events'
import { User } from '../../interfaces/user.interface'

interface RoomMessage {
  messageId: string
  userId: string
  username: string
  content: string
  timestamp: string
  sequence: number
}

interface StreamState {
  isActive: boolean
  streamerId: string | null  // Username of the streamer (for display), not userId
  quality: 'low' | 'medium' | 'high'
}

interface RoomParticipant {
  id: string
  username: string
  role: 'teacher' | 'student' | 'admin'
  displayName?: string | null
  email?: string | null
  status: 'online' | 'offline' | 'away'
  socketId: string
  joinedAt: string
  canStream: boolean
  canChat: boolean
  canScreenShare: boolean
  isStreaming: boolean
}

interface RateLimitEntry {
  count: number
  resetAt: number
}

export class RealTimeCommunicationSystem extends EventEmitter {
  private io: SocketIOServer | null = null
  private rooms: Map<string, Map<string, RoomParticipant>> = new Map()
  private streams: Map<string, StreamState> = new Map()
  private messages: Map<string, RoomMessage[]> = new Map()
  private roomLastActivity: Map<string, number> = new Map()
  private cleanupInterval: NodeJS.Timeout | null = null
  private messageLimiter: Map<string, RateLimitEntry> = new Map()
  private messageSequence: Map<string, number> = new Map()

  // Configuration
  private readonly INACTIVE_THRESHOLD = 30 * 60 * 1000 // 30 minutes
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 minutes
  private readonly MESSAGE_HISTORY_LIMIT = 100
  private readonly RATE_LIMIT_MESSAGES = 5
  private readonly RATE_LIMIT_WINDOW = 10000 // 10 seconds

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
    this.startAutomaticCleanup()
    console.log('RealTimeCommunicationSystem initialized')
  }

  private startAutomaticCleanup() {
    // Start cleanup timer
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveRooms()
    }, this.CLEANUP_INTERVAL)

    console.log('Automatic room cleanup started')
  }

  private cleanupInactiveRooms() {
    const now = Date.now()
    const roomsToCleanup: string[] = []

    for (const [roomId, lastActivity] of this.roomLastActivity.entries()) {
      if (now - lastActivity > this.INACTIVE_THRESHOLD) {
        const participants = this.rooms.get(roomId)
        if (!participants || participants.size === 0) {
          roomsToCleanup.push(roomId)
        }
      }
    }

    // Cleanup identified rooms
    for (const roomId of roomsToCleanup) {
      console.log(`Auto-cleaning inactive room: ${roomId}`)
      this.deallocateResources(roomId).catch(error => {
        console.error(`Failed to cleanup room ${roomId}:`, error)
      })
    }

    if (roomsToCleanup.length > 0) {
      console.log(`Cleaned up ${roomsToCleanup.length} inactive rooms`)
    }
  }

  private updateRoomActivity(roomId: string) {
    this.roomLastActivity.set(roomId, Date.now())
  }

  private setupEventHandlers() {
    if (!this.io) throw new SystemError('COMMS_NOT_INITIALIZED', 'Communication system not initialized')

    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`)

      // Room events
      socket.on('join_room', (data: { roomId: string; user: User }) => {
        this.handleJoinRoom(socket, data.roomId, data.user)
      })

      socket.on('leave_room', (roomId: string) => {
        this.handleLeaveRoom(socket, roomId)
      })

      // Chat events
      socket.on('send_message', (data: { roomId: string; message: Omit<RoomMessage, 'timestamp' | 'messageId' | 'sequence'> }) => {
        this.handleMessage(socket, data.roomId, data.message)
      })

      // Request message history
      socket.on('request_message_history', (roomId: string) => {
        this.handleRequestMessageHistory(socket, roomId)
      })

      // Stream events
      socket.on('start_stream', (data: { roomId: string; username: string; quality: StreamState['quality'] }) => {
        this.handleStartStream(socket, data.roomId, data.username, data.quality)
      })

      socket.on('stop_stream', (roomId: string) => {
        this.handleStopStream(socket, roomId)
      })

      // WebRTC signaling events
      socket.on('webrtc:offer', (data: { roomId: string; targetPeerId: string; offer: RTCSessionDescriptionInit }) => {
        this.handleWebRTCOffer(socket, data)
      })

      socket.on('webrtc:answer', (data: { targetPeerId: string; answer: RTCSessionDescriptionInit }) => {
        this.handleWebRTCAnswer(socket, data)
      })

      socket.on('webrtc:ice-candidate', (data: { targetPeerId: string; candidate: RTCIceCandidateInit }) => {
        this.handleWebRTCIceCandidate(socket, data)
      })

      socket.on('disconnect', () => {
        this.handleDisconnect(socket)
      })
    })
  }

  private handleJoinRoom(socket: any, roomId: string, user: User) {
    try {
      socket.join(roomId)

      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, new Map())
      }

      const participant: RoomParticipant = {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
        email: user.email,
        status: user.status,
        socketId: socket.id,
        joinedAt: new Date().toISOString(),
        canStream: user.role === 'teacher',
        canChat: true,
        canScreenShare: user.role === 'teacher',
        isStreaming: false
      }

      this.rooms.get(roomId)!.set(socket.id, participant)
      this.updateRoomActivity(roomId)

      socket.emit('welcome', {
        message: `Welcome to ${roomId}, ${user.username}`,
        timestamp: new Date().toISOString()
      })

      // Send room state WITHOUT messages (separate history)
      socket.emit('room_state', {
        stream: this.streams.get(roomId) || { isActive: false, streamerId: null, quality: 'high' },
        participants: Array.from(this.rooms.get(roomId)!.values())
      })

      // Notify others with full participant object
      socket.to(roomId).emit('user_joined', participant)

      console.log(`User ${user.username} joined room ${roomId}`)
    } catch (error) {
      console.error('Error in handleJoinRoom:', error)
      socket.emit('error', { message: 'Failed to join room' })
    }
  }

  private handleRequestMessageHistory(socket: any, roomId: string) {
    try {
      // Send message history separately, only when requested
      const messages = this.messages.get(roomId) || []
      socket.emit('message_history', { messages })
      console.log(`Sent ${messages.length} messages to ${socket.id} for room ${roomId}`)
    } catch (error) {
      console.error('Error in handleRequestMessageHistory:', error)
      socket.emit('error', { message: 'Failed to retrieve message history' })
    }
  }

  private handleLeaveRoom(socket: any, roomId: string) {
    try {
      const participant = this.rooms.get(roomId)?.get(socket.id)

      socket.leave(roomId)
      this.rooms.get(roomId)?.delete(socket.id)

      if (participant) {
        socket.to(roomId).emit('user_left', participant)
        console.log(`User ${participant.username} left room ${roomId}`)
      }

      this.updateRoomActivity(roomId)
    } catch (error) {
      console.error('Error in handleLeaveRoom:', error)
    }
  }

  private checkRateLimit(userId: string): boolean {
    const now = Date.now()
    const limit = this.messageLimiter.get(userId)

    if (limit && now < limit.resetAt) {
      if (limit.count >= this.RATE_LIMIT_MESSAGES) {
        return false // Rate limit exceeded
      }
      limit.count++
    } else {
      this.messageLimiter.set(userId, {
        count: 1,
        resetAt: now + this.RATE_LIMIT_WINDOW
      })
    }

    return true
  }

  private handleMessage(socket: any, roomId: string, message: Omit<RoomMessage, 'timestamp' | 'messageId' | 'sequence'>) {
    try {
      // Rate limiting
      if (!this.checkRateLimit(message.userId)) {
        socket.emit('error', {
          message: 'Rate limit exceeded. Please slow down.'
        })
        return
      }

      // Get or initialize sequence number
      if (!this.messageSequence.has(roomId)) {
        this.messageSequence.set(roomId, 0)
      }
      const sequence = this.messageSequence.get(roomId)! + 1
      this.messageSequence.set(roomId, sequence)

      const fullMessage: RoomMessage = {
        ...message,
        messageId: `${roomId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        sequence,
        timestamp: new Date().toISOString()
      }

      if (!this.messages.has(roomId)) {
        this.messages.set(roomId, [])
      }
      this.messages.get(roomId)!.push(fullMessage)

      // Limit message history
      const messageArray = this.messages.get(roomId)!
      if (messageArray.length > this.MESSAGE_HISTORY_LIMIT) {
        messageArray.shift()
      }

      this.updateRoomActivity(roomId)

      // Broadcast to room (not in room_state!)
      this.io!.to(roomId).emit('new_message', fullMessage)
    } catch (error) {
      console.error('Error in handleMessage:', error)
      socket.emit('error', { message: 'Failed to send message' })
    }
  }

  private handleStartStream(socket: any, roomId: string, username: string, quality: StreamState['quality']) {
    try {
      const streamState: StreamState = {
        isActive: true,
        streamerId: username,  // Use username for display (not UUID)
        quality
      }
      this.streams.set(roomId, streamState)

      // Update participant streaming status
      const participant = this.rooms.get(roomId)?.get(socket.id)
      if (participant) {
        participant.isStreaming = true
      }

      this.updateRoomActivity(roomId)
      this.io!.to(roomId).emit('stream_started', streamState)
      console.log(`Stream started in room ${roomId} by ${username}`)
    } catch (error) {
      console.error('Error in handleStartStream:', error)
      socket.emit('error', { message: 'Failed to start stream' })
    }
  }

  private handleStopStream(socket: any, roomId: string) {
    try {
      this.streams.delete(roomId)

      // Update participant streaming status
      const participant = this.rooms.get(roomId)?.get(socket.id)
      if (participant) {
        participant.isStreaming = false
      }

      this.updateRoomActivity(roomId)
      this.io!.to(roomId).emit('stream_stopped')
      console.log(`Stream stopped in room ${roomId}`)
    } catch (error) {
      console.error('Error in handleStopStream:', error)
      socket.emit('error', { message: 'Failed to stop stream' })
    }
  }

  // WebRTC Signaling Handlers
  private handleWebRTCOffer(socket: any, data: { roomId: string; targetPeerId: string; offer: RTCSessionDescriptionInit }) {
    try {
      socket.to(data.targetPeerId).emit('webrtc:offer', {
        from: socket.id,
        offer: data.offer
      })
      console.log(`WebRTC offer sent from ${socket.id} to ${data.targetPeerId}`)
    } catch (error) {
      console.error('Error in handleWebRTCOffer:', error)
    }
  }

  private handleWebRTCAnswer(socket: any, data: { targetPeerId: string; answer: RTCSessionDescriptionInit }) {
    try {
      socket.to(data.targetPeerId).emit('webrtc:answer', {
        from: socket.id,
        answer: data.answer
      })
      console.log(`WebRTC answer sent from ${socket.id} to ${data.targetPeerId}`)
    } catch (error) {
      console.error('Error in handleWebRTCAnswer:', error)
    }
  }

  private handleWebRTCIceCandidate(socket: any, data: { targetPeerId: string; candidate: RTCIceCandidateInit }) {
    try {
      socket.to(data.targetPeerId).emit('webrtc:ice-candidate', {
        from: socket.id,
        candidate: data.candidate
      })
    } catch (error) {
      console.error('Error in handleWebRTCIceCandidate:', error)
    }
  }

  private handleDisconnect(socket: any) {
    try {
      // Remove socket from all rooms
      this.rooms.forEach((participants, roomId) => {
        const participant = participants.get(socket.id)
        if (participant) {
          participants.delete(socket.id)
          this.io!.to(roomId).emit('user_left', participant)
          this.updateRoomActivity(roomId)
          console.log(`User ${participant.username} disconnected from room ${roomId}`)
        }
      })
    } catch (error) {
      console.error('Error in handleDisconnect:', error)
    }
  }

  setupForRoom(roomId: string): void {
    try {
      if (!this.io) throw new SystemError('COMMS_NOT_INITIALIZED', 'Communication system not initialized')

      this.rooms.set(roomId, new Map())
      this.messages.set(roomId, [])
      this.messageSequence.set(roomId, 0)
      this.updateRoomActivity(roomId)
      console.log(`Communication setup for room: ${roomId}`)
    } catch (error) {
      throw new SystemError('COMMUNICATION_SETUP_FAILED', 'Failed to setup room communication')
    }
  }

  allocateResources(eventId: string): void {
    try {
      // Resources are automatically allocated when users join the room
      this.updateRoomActivity(eventId)
      console.log(`Resources allocated for event: ${eventId}`)
    } catch (error) {
      throw new SystemError('RESOURCE_ALLOCATION_FAILED', 'Failed to allocate resources')
    }
  }

  async deallocateResources(eventId: string): Promise<void> {
    try {
      // Notify all clients before cleanup
      if (this.io) {
        this.io.to(eventId).emit('room_closed', {
          roomId: eventId,
          reason: 'cleanup',
          timestamp: new Date().toISOString()
        })

        // Disconnect all sockets from room
        const sockets = await this.io.in(eventId).fetchSockets()
        for (const socket of sockets) {
          socket.leave(eventId)
        }
      }

      // Clean up room resources
      this.rooms.delete(eventId)
      this.streams.delete(eventId)
      this.messages.delete(eventId)
      this.roomLastActivity.delete(eventId)
      this.messageSequence.delete(eventId)

      console.log(`Resources deallocated for event: ${eventId}`)
    } catch (error) {
      throw new SystemError('RESOURCE_DEALLOCATION_FAILED', 'Failed to deallocate resources')
    }
  }

  async getResourceStatus(eventId: string) {
    try {
      const hasRoom = this.rooms.has(eventId)
      const stream = this.streams.get(eventId)
      const participantCount = this.rooms.get(eventId)?.size || 0

      return {
        websocket: hasRoom,
        webrtc: !!stream?.isActive,
        participants: participantCount,
        resources: {
          allocated: hasRoom,
          type: 'lecture',
        },
      }
    } catch (error) {
      throw new SystemError('RESOURCE_STATUS_FAILED', 'Failed to get resource status')
    }
  }

  /**
   * Get active participants in a room from WebSocket memory
   * Returns array of participants currently connected via WebSocket
   */
  getRoomParticipants(roomId: string): RoomParticipant[] {
    const participants = this.rooms.get(roomId)
    if (!participants) {
      return []
    }
    return Array.from(participants.values())
  }

  async shutdown(): Promise<void> {
    try {
      console.log('Shutting down RealTimeCommunicationSystem...')

      // Stop cleanup timer
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval)
        this.cleanupInterval = null
      }

      // Notify all clients
      if (this.io) {
        this.io.emit('server_shutdown', {
          message: 'Server is shutting down',
          timestamp: new Date().toISOString()
        })

        // Close all connections
        const sockets = await this.io.fetchSockets()
        for (const socket of sockets) {
          socket.disconnect(true)
        }

        // Close server
        this.io.close()
        this.io = null
      }

      // Clear all data
      this.rooms.clear()
      this.streams.clear()
      this.messages.clear()
      this.roomLastActivity.clear()
      this.messageLimiter.clear()
      this.messageSequence.clear()

      console.log('RealTimeCommunicationSystem shutdown complete')
    } catch (error) {
      console.error('Error during shutdown:', error)
      throw new SystemError('SHUTDOWN_FAILED', 'Failed to shutdown communication system')
    }
  }
}
