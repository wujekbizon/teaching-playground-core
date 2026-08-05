import { CommsConfig, SystemError, TrustedLaunchClaims } from '../../interfaces'
import { Server as SocketIOServer, Socket } from 'socket.io'
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
  handRaised: boolean // v1.3.1: Hand raise feature
  handRaisedAt?: string // v1.3.1: Timestamp when hand was raised
}

interface RateLimitEntry {
  count: number
  resetAt: number
}

// v1.4.6: Interface for tracking lecture information
interface LectureInfo {
  id: string
  status: 'scheduled' | 'open' | 'delayed' | 'active' | 'in-progress' | 'completed' | 'cancelled'
  roomId: string
  capacity?: number
  organizationId?: string
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

  // v1.4.6: Room-lecture mapping for fast validation
  private roomLectureMap: Map<string, string> = new Map() // roomId → lectureId
  private lectureLookup: Map<string, LectureInfo> = new Map() // lectureId → lecture info

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
    if (this.config?.requireAuthentication && !this.config.identityProvider) {
      throw new SystemError(
        'AUTH_CONFIGURATION_INVALID',
        'An identityProvider is required when requireAuthentication is enabled'
      )
    }

    if (this.config?.requireLaunchClaims && !this.config.launchClaimVerifier) {
      throw new SystemError(
        'LAUNCH_CONFIGURATION_INVALID',
        'A launchClaimVerifier is required when requireLaunchClaims is enabled'
      )
    }

    this.io = new SocketIOServer(server, {
      cors: {
        origin: this.config?.allowedOrigins || "*",
        methods: ["GET", "POST"]
      },
      pingTimeout: 10000,
      pingInterval: 5000
    })

    if (this.config?.socketAdapter) {
      this.io.adapter(this.config.socketAdapter as Parameters<SocketIOServer['adapter']>[0])
    }

    if (this.config?.identityProvider) {
      this.io.use(async (socket, next) => {
        try {
          const user = await this.config!.identityProvider!({
            auth: socket.handshake.auth as Record<string, unknown>,
            headers: socket.handshake.headers
          })
          if (!user) {
            next(new Error('UNAUTHORIZED'))
            return
          }
          socket.data.user = user
          next()
        } catch {
          next(new Error('UNAUTHORIZED'))
        }
      })
    }

    this.setupEventHandlers()
    this.startAutomaticCleanup()
    console.log('RealTimeCommunicationSystem initialized')
  }

  private startAutomaticCleanup() {
    // Start cleanup timer
    this.cleanupInterval = setInterval(() => {
      this.cleanupInactiveRooms()
    }, this.CLEANUP_INTERVAL)
    // The maintenance timer must not keep CLI consumers or test processes alive.
    this.cleanupInterval.unref()

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
      socket.on('join_room', (data: { roomId: string; reservationId?: string; user?: User; launchClaims?: unknown }) => {
        const user = socket.data.user as User | undefined ?? data.user
        if (!user || (this.config?.requireAuthentication && !socket.data.user)) {
          socket.emit('join_room_error', {
            code: 'UNAUTHORIZED',
            message: 'Authentication is required',
            roomId: data.roomId
          })
          return
        }
        void this.handleJoinRoom(socket, data.roomId, user, data.reservationId, data.launchClaims)
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

      // v1.3.1: Participant control events
      socket.on('mute_all_participants', (data: { roomId: string; requesterId: string }) => {
        try {
          const requester = this.requireSocketParticipant(socket, data.roomId)
          this.muteAllParticipants(data.roomId, requester.id)
        } catch (error) {
          socket.emit('error', { message: error instanceof Error ? error.message : 'Failed to mute all participants' })
        }
      })

      socket.on('mute_participant', (data: { roomId: string; targetUserId: string; requesterId: string }) => {
        try {
          const requester = this.requireSocketParticipant(socket, data.roomId)
          this.muteParticipant(data.roomId, data.targetUserId, requester.id)
        } catch (error) {
          socket.emit('error', { message: error instanceof Error ? error.message : 'Failed to mute participant' })
        }
      })

      socket.on('kick_participant', (data: { roomId: string; targetUserId: string; requesterId: string; reason?: string }) => {
        try {
          // v1.4.1: Enhanced logging for debugging
          console.log(`Kick participant event received - Room: ${data.roomId}, Target: ${data.targetUserId}, Requester: ${data.requesterId}, Reason: ${data.reason || 'none'}`)
          const requester = this.requireSocketParticipant(socket, data.roomId)
          this.kickParticipant(data.roomId, data.targetUserId, requester.id, data.reason)
        } catch (error) {
          console.error('Error kicking participant:', error)
          socket.emit('error', { message: error instanceof Error ? error.message : 'Failed to kick participant' })
        }
      })

      socket.on('raise_hand', (data: { roomId: string; userId: string }) => {
        try {
          const participant = this.requireSocketParticipant(socket, data.roomId)
          this.raiseHand(data.roomId, participant.id)
        } catch (error) {
          socket.emit('error', { message: error instanceof Error ? error.message : 'Failed to raise hand' })
        }
      })

      socket.on('lower_hand', (data: { roomId: string; userId: string }) => {
        try {
          const participant = this.requireSocketParticipant(socket, data.roomId)
          this.lowerHand(data.roomId, participant.id)
        } catch (error) {
          socket.emit('error', { message: error instanceof Error ? error.message : 'Failed to lower hand' })
        }
      })

      // v1.4.0: Recording notification events
      socket.on('recording_started', (data: { roomId: string; teacherId: string }) => {
        try {
          const teacher = this.requireSocketParticipant(socket, data.roomId)
          this.requireInstructor(teacher)
          // Notify all participants in the room
          if (this.io) {
            this.io.to(data.roomId).emit('lecture_recording_started', {
              teacherId: teacher.id,
              timestamp: new Date().toISOString()
            })
          }
          console.log(`Recording started in room ${data.roomId} by teacher ${teacher.id}`)
        } catch (error) {
          socket.emit('error', { message: error instanceof Error ? error.message : 'Failed to notify recording start' })
        }
      })

      socket.on('recording_stopped', (data: { roomId: string; teacherId: string; duration: number }) => {
        try {
          const teacher = this.requireSocketParticipant(socket, data.roomId)
          this.requireInstructor(teacher)
          // Notify all participants in the room
          if (this.io) {
            this.io.to(data.roomId).emit('lecture_recording_stopped', {
              teacherId: teacher.id,
              duration: data.duration,
              timestamp: new Date().toISOString()
            })
          }
          console.log(`Recording stopped in room ${data.roomId} by teacher ${teacher.id} (duration: ${data.duration}s)`)
        } catch (error) {
          socket.emit('error', { message: error instanceof Error ? error.message : 'Failed to notify recording stop' })
        }
      })

      socket.on('disconnect', () => {
        this.handleDisconnect(socket)
      })
    })
  }

  private requireSocketParticipant(socket: Socket, roomId: string): RoomParticipant {
    const participant = this.rooms.get(roomId)?.get(socket.id)
    if (!participant) {
      throw new SystemError('PERMISSION_DENIED', 'The requesting socket is not a member of this room')
    }
    return participant
  }

  private requireInstructor(participant: RoomParticipant): void {
    if (participant.role !== 'teacher' && participant.role !== 'admin') {
      throw new SystemError('PERMISSION_DENIED', 'Only teachers/admins can perform this action')
    }
  }

  private async verifyLaunchClaims(socket: any, user: User, roomId: string, reservationId?: string, payloadClaims?: unknown): Promise<TrustedLaunchClaims | null> {
    if (!this.config?.launchClaimVerifier && !this.config?.requireLaunchClaims) return null
    const source = this.config.launchClaimSource ?? 'either'
    const handshakeClaims = socket.handshake?.auth?.launchClaims
    const claims = source === 'joinPayload' ? payloadClaims : source === 'handshakeAuth' ? handshakeClaims : payloadClaims ?? handshakeClaims
    const verified = this.config.launchClaimVerifier ? await this.config.launchClaimVerifier({
      claims, user, roomId, reservationId, auth: socket.handshake?.auth ?? {}, headers: socket.handshake?.headers ?? {},
    }) : null
    if (!verified) throw new SystemError('LAUNCH_CLAIMS_REQUIRED', 'A trusted host launch decision is required')
    const now = Date.now()
    if (!verified.allowed || verified.organizationId !== user.organizationId || verified.userId !== user.id ||
        verified.roomId !== roomId || verified.reservationId !== reservationId || (verified.role && verified.role !== user.role)) {
      throw new SystemError('LAUNCH_CLAIMS_INVALID', 'Trusted launch claims do not match this user, room, reservation, and organization')
    }
    const expiresAt = verified.expiresAt ? Date.parse(verified.expiresAt) : undefined
    const notBefore = verified.notBefore ? Date.parse(verified.notBefore) : undefined
    if ((expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt <= now)) ||
        (notBefore !== undefined && (!Number.isFinite(notBefore) || notBefore > now))) {
      throw new SystemError('LAUNCH_CLAIMS_EXPIRED', 'Trusted launch claims are outside their valid time window')
    }
    return verified
  }

  private async handleJoinRoom(socket: any, roomId: string, user: User, reservationId?: string, launchClaims?: unknown) {
    try {
      // v1.4.6: Validate lecture status before allowing join
      const lectureId = this.roomLectureMap.get(roomId)
      if (lectureId) {
        const lecture = this.lectureLookup.get(lectureId)
        if (lecture) {
          if (lecture.organizationId && (reservationId !== lecture.id || user.organizationId !== lecture.organizationId)) {
            socket.emit('join_room_error', { code: reservationId !== lecture.id ? 'ROOM_UNAVAILABLE' : 'ORGANIZATION_MISMATCH',
              message: 'A matching reservation and organization are required', roomId })
            return
          }
          await this.verifyLaunchClaims(socket, user, roomId, reservationId, launchClaims)
          // Only allow joining if lecture is active or in-progress
          if (lecture.status !== 'open' && lecture.status !== 'active' && lecture.status !== 'in-progress') {
            const statusMessages = {
              'completed': 'This lecture has ended',
              'cancelled': 'This lecture has been cancelled',
              'scheduled': 'This lecture has not started yet'
            }
            const message = statusMessages[lecture.status as keyof typeof statusMessages] || 'This lecture is not available'

            console.log(`User ${user.username} denied entry to room ${roomId} - Lecture status: ${lecture.status}`)
            socket.emit('join_room_error', {
              code: 'ROOM_UNAVAILABLE',
              message,
              lectureStatus: lecture.status,
              roomId
            })
            return
          }
          const participants = this.rooms.get(roomId)
          if (lecture.capacity !== undefined && participants && participants.size >= lecture.capacity) {
            socket.emit('join_room_error', {
              code: 'ROOM_CAPACITY_EXCEEDED', message: `This lecture has reached its capacity of ${lecture.capacity}`,
              lectureStatus: lecture.status, roomId,
            })
            return
          }
        }
      }

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
        isStreaming: false,
        handRaised: false // v1.3.1: Initialize hand raise state
      }

      this.rooms.get(roomId)!.set(socket.id, participant)
      this.updateRoomActivity(roomId)

      socket.emit('welcome', {
        message: `Welcome to ${roomId}, ${user.username}`,
        timestamp: new Date().toISOString()
      })

      // Send room state WITHOUT messages (separate history)
      const allParticipants = Array.from(this.rooms.get(roomId)!.values())
      socket.emit('room_state', {
        stream: this.streams.get(roomId) || { isActive: false, streamerId: null, quality: 'high' },
        participants: allParticipants
      })

      // v1.4.1: Enhanced logging for debugging
      console.log(`User ${user.username} (${socket.id}) joined room ${roomId}`)
      console.log(`Room ${roomId} now has ${allParticipants.length} participants:`, allParticipants.map(p => ({ id: p.id, username: p.username, socketId: p.socketId })))

      // v1.4.2: Notify others with full participant object and log the emission
      const existingParticipants = allParticipants.filter(p => p.socketId !== socket.id)
      console.log(`Emitting 'user_joined' to ${existingParticipants.length} existing participants:`,
        existingParticipants.map(p => ({ userId: p.id, username: p.username, socketId: p.socketId })))

      // v1.4.4: Include userId explicitly for frontend compatibility
      socket.to(roomId).emit('user_joined', {
        userId: participant.id,
        username: participant.username,
        socketId: participant.socketId,
        role: participant.role,
        displayName: participant.displayName,
        status: participant.status
      })
    } catch (error) {
      console.error('Error in handleJoinRoom:', error)
      const systemError = error instanceof SystemError ? error : new SystemError('ROOM_JOIN_FAILED', 'Failed to join room')
      socket.emit('join_room_error', { code: systemError.code, message: systemError.message, roomId })
    }
  }

  private handleRequestMessageHistory(socket: any, roomId: string) {
    try {
      this.requireSocketParticipant(socket, roomId)
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
      const participant = this.requireSocketParticipant(socket, roomId)
      // Rate limiting
      if (!this.checkRateLimit(participant.id)) {
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
        content: message.content,
        userId: participant.id,
        username: participant.username,
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

      // v1.4.6: Log chat messages for debugging
      const preview = message.content.length > 50
        ? `${message.content.substring(0, 50)}...`
        : message.content
      console.log(`Chat message from ${participant.username} in room ${roomId}: ${preview}`)

      // Broadcast to room (not in room_state!)
      this.io!.to(roomId).emit('new_message', fullMessage)
    } catch (error) {
      console.error('Error in handleMessage:', error)
      socket.emit('error', { message: 'Failed to send message' })
    }
  }

  private handleStartStream(socket: any, roomId: string, username: string, quality: StreamState['quality']) {
    try {
      const participant = this.requireSocketParticipant(socket, roomId)
      if (!participant.canStream) {
        throw new SystemError('PERMISSION_DENIED', 'This participant cannot start a stream')
      }
      const streamState: StreamState = {
        isActive: true,
        streamerId: participant.username,
        quality
      }
      this.streams.set(roomId, streamState)

      // Update participant streaming status
      participant.isStreaming = true

      this.updateRoomActivity(roomId)
      this.io!.to(roomId).emit('stream_started', streamState)
      console.log(`Stream started in room ${roomId} by ${participant.username}`)
    } catch (error) {
      console.error('Error in handleStartStream:', error)
      socket.emit('error', { message: 'Failed to start stream' })
    }
  }

  private handleStopStream(socket: any, roomId: string) {
    try {
      const participant = this.requireSocketParticipant(socket, roomId)
      const stream = this.streams.get(roomId)
      if (stream && stream.streamerId !== participant.username && participant.role !== 'admin') {
        throw new SystemError('PERMISSION_DENIED', 'Only the active streamer or an admin can stop this stream')
      }
      this.streams.delete(roomId)

      // Update participant streaming status
      participant.isStreaming = false

      this.updateRoomActivity(roomId)
      this.io!.to(roomId).emit('stream_stopped')
      console.log(`Stream stopped in room ${roomId}`)
    } catch (error) {
      console.error('Error in handleStopStream:', error)
      socket.emit('error', { message: 'Failed to stop stream' })
    }
  }

  // WebRTC Signaling Handlers (v1.2.0: Updated to match API contract)
  private handleWebRTCOffer(socket: any, data: { roomId: string; targetPeerId: string; offer: RTCSessionDescriptionInit }) {
    try {
      this.requireSocketParticipant(socket, data.roomId)
      if (!this.rooms.get(data.roomId)?.has(data.targetPeerId)) {
        throw new SystemError('PERMISSION_DENIED', 'The target peer is not in this room')
      }
      socket.to(data.targetPeerId).emit('webrtc:offer', {
        fromPeerId: socket.id,  // v1.2.0: Changed from 'from' to 'fromPeerId'
        offer: data.offer
      })
      console.log(`WebRTC offer sent from ${socket.id} to ${data.targetPeerId}`)
    } catch (error) {
      console.error('Error in handleWebRTCOffer:', error)
    }
  }

  private handleWebRTCAnswer(socket: any, data: { targetPeerId: string; answer: RTCSessionDescriptionInit }) {
    try {
      if (!this.arePeersInSameRoom(socket.id, data.targetPeerId)) {
        throw new SystemError('PERMISSION_DENIED', 'Peers must share a room')
      }
      socket.to(data.targetPeerId).emit('webrtc:answer', {
        fromPeerId: socket.id,  // v1.2.0: Changed from 'from' to 'fromPeerId'
        answer: data.answer
      })
      console.log(`WebRTC answer sent from ${socket.id} to ${data.targetPeerId}`)
    } catch (error) {
      console.error('Error in handleWebRTCAnswer:', error)
    }
  }

  private handleWebRTCIceCandidate(socket: any, data: { targetPeerId: string; candidate: RTCIceCandidateInit }) {
    try {
      if (!this.arePeersInSameRoom(socket.id, data.targetPeerId)) {
        throw new SystemError('PERMISSION_DENIED', 'Peers must share a room')
      }
      socket.to(data.targetPeerId).emit('webrtc:ice-candidate', {
        fromPeerId: socket.id,  // v1.2.0: Changed from 'from' to 'fromPeerId'
        candidate: data.candidate
      })
    } catch (error) {
      console.error('Error in handleWebRTCIceCandidate:', error)
    }
  }

  private arePeersInSameRoom(firstSocketId: string, secondSocketId: string): boolean {
    return Array.from(this.rooms.values()).some(
      participants => participants.has(firstSocketId) && participants.has(secondSocketId)
    )
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

      // v1.4.1 HOTFIX: Only initialize if room doesn't exist
      // This prevents clearing existing participants when room is created in database
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, new Map())
      }
      if (!this.messages.has(roomId)) {
        this.messages.set(roomId, [])
      }
      if (!this.messageSequence.has(roomId)) {
        this.messageSequence.set(roomId, 0)
      }

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

  /**
   * Clears all ephemeral data for a specific room
   * Called when lecture ends (completed/cancelled)
   * This is v1.1.3 feature for proper room cleanup
   */
  clearRoom(roomId: string): void {
    try {
      console.log(`Clearing room ${roomId} - removing all ephemeral data`)

      // Clear participants from memory
      const participantCount = this.rooms.get(roomId)?.size || 0
      const participantSocketIds = [...(this.rooms.get(roomId)?.keys() ?? [])]
      this.rooms.delete(roomId)

      // Clear message history from memory
      const messageCount = this.messages.get(roomId)?.length || 0
      this.messages.delete(roomId)
      this.messageSequence.delete(roomId)

      // Clear active streams
      const hadStream = this.streams.has(roomId)
      this.streams.delete(roomId)

      // Clear activity tracking
      this.roomLastActivity.delete(roomId)

      // Emit event to all clients in this room
      if (this.io) {
        this.io.to(roomId).emit('room_cleared', {
          roomId,
          reason: 'Lecture ended',
          timestamp: new Date().toISOString()
        })
        // A cleared lecture must not remain subscribed to the Socket.IO room;
        // otherwise the old cohort could receive events from the next lecture.
        for (const socketId of participantSocketIds) {
          this.io.sockets?.sockets?.get(socketId)?.disconnect(true)
        }
      }

      console.log(`✓ Room ${roomId} cleared successfully:`, {
        participants: participantCount,
        messages: messageCount,
        hadStream
      })
    } catch (error) {
      console.error(`Failed to clear room ${roomId}:`, error)
      throw new SystemError('ROOM_CLEAR_FAILED', 'Failed to clear room data')
    }
  }

  /**
   * v1.3.1: Mute all participants in a room (teacher only)
   */
  muteAllParticipants(roomId: string, requesterId: string): void {
    const participants = this.rooms.get(roomId)
    if (!participants) {
      console.error(`Mute all failed: Room ${roomId} not found`)
      throw new SystemError('ROOM_NOT_FOUND', `Room ${roomId} not found`)
    }

    // Verify requester is teacher/admin
    const requester = Array.from(participants.values()).find(p => p.id === requesterId)
    if (!requester || (requester.role !== 'teacher' && requester.role !== 'admin')) {
      console.error(`Mute all failed: User ${requesterId} (role: ${requester?.role || 'unknown'}) lacks permission`)
      throw new SystemError('PERMISSION_DENIED', 'Only teachers/admins can mute all participants')
    }

    console.log(`Muting all participants in room ${roomId} by ${requesterId} (${requester.username})`)

    // Emit to all participants in the room
    if (this.io) {
      this.io.to(roomId).emit('mute_all', {
        requestedBy: requesterId,
        timestamp: new Date().toISOString()
      })
    }

    console.log(`All participants muted in room ${roomId} by ${requesterId}`)
  }

  /**
   * v1.3.1: Mute specific participant (teacher only)
   */
  muteParticipant(roomId: string, targetUserId: string, requesterId: string): void {
    const participants = this.rooms.get(roomId)
    if (!participants) {
      console.error(`Mute participant failed: Room ${roomId} not found`)
      throw new SystemError('ROOM_NOT_FOUND', `Room ${roomId} not found`)
    }

    // Verify requester is teacher/admin
    const requester = Array.from(participants.values()).find(p => p.id === requesterId)
    if (!requester || (requester.role !== 'teacher' && requester.role !== 'admin')) {
      console.error(`Mute participant failed: User ${requesterId} (role: ${requester?.role || 'unknown'}) lacks permission`)
      throw new SystemError('PERMISSION_DENIED', 'Only teachers/admins can mute participants')
    }

    // Find target participant's socket
    const targetParticipant = Array.from(participants.values()).find(p => p.id === targetUserId)
    if (!targetParticipant) {
      console.error(`Mute participant failed: Participant ${targetUserId} not found in room ${roomId}`)
      throw new SystemError('PARTICIPANT_NOT_FOUND', `Participant ${targetUserId} not found`)
    }

    console.log(`Muting participant ${targetUserId} (${targetParticipant.username}, socket: ${targetParticipant.socketId}) in room ${roomId} by ${requesterId}`)

    // Emit to specific participant
    if (this.io) {
      this.io.to(targetParticipant.socketId).emit('muted_by_teacher', {
        requestedBy: requesterId,
        reason: 'Muted by instructor',
        timestamp: new Date().toISOString()
      })
    }

    console.log(`Participant ${targetUserId} successfully muted in room ${roomId}`)
  }

  /**
   * v1.3.1: Kick participant from room (teacher/admin only)
   */
  kickParticipant(
    roomId: string,
    targetUserId: string,
    requesterId: string,
    reason?: string
  ): void {
    const participants = this.rooms.get(roomId)
    if (!participants) {
      console.error(`Kick failed: Room ${roomId} not found`)
      throw new SystemError('ROOM_NOT_FOUND', `Room ${roomId} not found`)
    }

    // Verify requester is teacher/admin
    const requester = Array.from(participants.values()).find(p => p.id === requesterId)
    if (!requester || (requester.role !== 'teacher' && requester.role !== 'admin')) {
      console.error(`Kick failed: User ${requesterId} (role: ${requester?.role || 'unknown'}) lacks permission`)
      throw new SystemError('PERMISSION_DENIED', 'Only teachers/admins can kick participants')
    }

    // Find target participant
    const targetParticipant = Array.from(participants.values()).find(p => p.id === targetUserId)
    if (!targetParticipant) {
      console.error(`Kick failed: Participant ${targetUserId} not found in room ${roomId}`)
      throw new SystemError('PARTICIPANT_NOT_FOUND', `Participant ${targetUserId} not found`)
    }

    console.log(`Kicking participant ${targetUserId} (${targetParticipant.username}, socket: ${targetParticipant.socketId}) from room ${roomId} by ${requesterId}`)

    // Emit kick event to target
    if (this.io) {
      this.io.to(targetParticipant.socketId).emit('kicked_from_room', {
        roomId,
        reason: reason || 'Removed by instructor',
        kickedBy: requesterId,
        timestamp: new Date().toISOString()
      })

      // Notify others in the room
      this.io.to(roomId).emit('participant_kicked', {
        userId: targetUserId,
        reason: reason || 'Removed by instructor'
      })

      // v1.4.1 HOTFIX: Force disconnect the kicked user's socket after a short delay
      // This ensures they are actually removed even if client doesn't handle the event
      setTimeout(() => {
        const sockets = this.io!.sockets.sockets
        const targetSocket = sockets.get(targetParticipant.socketId)
        if (targetSocket) {
          console.log(`Force disconnecting kicked user ${targetUserId} (socket: ${targetParticipant.socketId})`)
          targetSocket.disconnect(true)
        }
      }, 1000) // 1 second delay to let the event be received first
    }

    // Remove from participants
    participants.delete(targetParticipant.socketId)

    console.log(`Participant ${targetUserId} successfully kicked from room ${roomId}`)
  }

  /**
   * v1.3.1: Raise hand
   */
  raiseHand(roomId: string, userId: string): void {
    const participants = this.rooms.get(roomId)
    if (!participants) {
      throw new SystemError('ROOM_NOT_FOUND', `Room ${roomId} not found`)
    }

    const participant = Array.from(participants.values()).find(p => p.id === userId)
    if (!participant) {
      throw new SystemError('PARTICIPANT_NOT_FOUND', `Participant ${userId} not found`)
    }

    // Update participant state
    participant.handRaised = true
    participant.handRaisedAt = new Date().toISOString()

    // Broadcast to room
    if (this.io) {
      this.io.to(roomId).emit('hand_raised', {
        userId,
        username: participant.username,
        timestamp: participant.handRaisedAt
      })
    }

    console.log(`Hand raised by ${userId} in room ${roomId}`)
  }

  /**
   * v1.3.1: Lower hand
   */
  lowerHand(roomId: string, userId: string): void {
    const participants = this.rooms.get(roomId)
    if (!participants) {
      throw new SystemError('ROOM_NOT_FOUND', `Room ${roomId} not found`)
    }

    const participant = Array.from(participants.values()).find(p => p.id === userId)
    if (!participant) {
      throw new SystemError('PARTICIPANT_NOT_FOUND', `Participant ${userId} not found`)
    }

    // Update participant state
    participant.handRaised = false
    participant.handRaisedAt = undefined

    // Broadcast to room
    if (this.io) {
      this.io.to(roomId).emit('hand_lowered', {
        userId,
        timestamp: new Date().toISOString()
      })
    }

    console.log(`Hand lowered by ${userId} in room ${roomId}`)
  }

  /**
   * v1.4.6: Register a lecture for a room
   * Called when lecture starts (status becomes 'active' or 'in-progress')
   */
  registerLecture(lectureId: string, roomId: string, status: LectureInfo['status'], capacity?: number, organizationId?: string): void {
    this.roomLectureMap.set(roomId, lectureId)
    this.lectureLookup.set(lectureId, { id: lectureId, status, roomId, capacity, organizationId })
    console.log(`Registered lecture ${lectureId} for room ${roomId} with status '${status}'`)
  }

  /**
   * v1.4.6: Update lecture status
   * Called when lecture status changes
   */
  updateLectureStatus(lectureId: string, status: LectureInfo['status']): void {
    const lecture = this.lectureLookup.get(lectureId)
    if (lecture) {
      lecture.status = status
      console.log(`Updated lecture ${lectureId} status to '${status}'`)
    } else {
      console.warn(`Attempted to update status for unknown lecture ${lectureId}`)
    }
  }

  /**
   * v1.4.6: Unregister a lecture
   * Called when lecture ends (completed/cancelled)
   */
  unregisterLecture(lectureId: string): void {
    const lecture = this.lectureLookup.get(lectureId)
    if (lecture) {
      if (this.roomLectureMap.get(lecture.roomId) === lectureId) this.roomLectureMap.delete(lecture.roomId)
      this.lectureLookup.delete(lectureId)
      console.log(`Unregistered lecture ${lectureId} from room ${lecture.roomId}`)
    } else {
      console.warn(`Attempted to unregister unknown lecture ${lectureId}`)
    }
  }

  /**
   * v1.4.6: Check if a room is available for joining
   * Returns true if lecture is active/in-progress, false otherwise
   */
  isRoomAvailable(roomId: string): boolean {
    const lectureId = this.roomLectureMap.get(roomId)
    if (!lectureId) {
      // No lecture registered for this room
      return false
    }

    const lecture = this.lectureLookup.get(lectureId)
    if (!lecture) {
      return false
    }

    // Room is available only if lecture is active or in-progress
    return lecture.status === 'open' || lecture.status === 'active' || lecture.status === 'in-progress'
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
      this.roomLectureMap.clear()
      this.lectureLookup.clear()

      console.log('RealTimeCommunicationSystem shutdown complete')
    } catch (error) {
      console.error('Error during shutdown:', error)
      throw new SystemError('SHUTDOWN_FAILED', 'Failed to shutdown communication system')
    }
  }

  isInitialized(): boolean {
    return this.io !== null
  }
}
