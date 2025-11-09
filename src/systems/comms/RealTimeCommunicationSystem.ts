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
  handRaised: boolean // v1.3.1: Hand raise feature
  handRaisedAt?: string // v1.3.1: Timestamp when hand was raised
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

      // v1.3.1: Participant control events
      socket.on('mute_all_participants', (data: { roomId: string; requesterId: string }) => {
        try {
          this.muteAllParticipants(data.roomId, data.requesterId)
        } catch (error) {
          socket.emit('error', { message: error instanceof Error ? error.message : 'Failed to mute all participants' })
        }
      })

      socket.on('mute_participant', (data: { roomId: string; targetUserId: string; requesterId: string }) => {
        try {
          this.muteParticipant(data.roomId, data.targetUserId, data.requesterId)
        } catch (error) {
          socket.emit('error', { message: error instanceof Error ? error.message : 'Failed to mute participant' })
        }
      })

      socket.on('kick_participant', (data: { roomId: string; targetUserId: string; requesterId: string; reason?: string }) => {
        try {
          // v1.4.1: Enhanced logging for debugging
          console.log(`Kick participant event received - Room: ${data.roomId}, Target: ${data.targetUserId}, Requester: ${data.requesterId}, Reason: ${data.reason || 'none'}`)
          this.kickParticipant(data.roomId, data.targetUserId, data.requesterId, data.reason)
        } catch (error) {
          console.error('Error kicking participant:', error)
          socket.emit('error', { message: error instanceof Error ? error.message : 'Failed to kick participant' })
        }
      })

      socket.on('raise_hand', (data: { roomId: string; userId: string }) => {
        try {
          this.raiseHand(data.roomId, data.userId)
        } catch (error) {
          socket.emit('error', { message: error instanceof Error ? error.message : 'Failed to raise hand' })
        }
      })

      socket.on('lower_hand', (data: { roomId: string; userId: string }) => {
        try {
          this.lowerHand(data.roomId, data.userId)
        } catch (error) {
          socket.emit('error', { message: error instanceof Error ? error.message : 'Failed to lower hand' })
        }
      })

      // v1.4.0: Recording notification events
      socket.on('recording_started', (data: { roomId: string; teacherId: string }) => {
        try {
          // Notify all participants in the room
          if (this.io) {
            this.io.to(data.roomId).emit('lecture_recording_started', {
              teacherId: data.teacherId,
              timestamp: new Date().toISOString()
            })
          }
          console.log(`Recording started in room ${data.roomId} by teacher ${data.teacherId}`)
        } catch (error) {
          socket.emit('error', { message: error instanceof Error ? error.message : 'Failed to notify recording start' })
        }
      })

      socket.on('recording_stopped', (data: { roomId: string; teacherId: string; duration: number }) => {
        try {
          // Notify all participants in the room
          if (this.io) {
            this.io.to(data.roomId).emit('lecture_recording_stopped', {
              teacherId: data.teacherId,
              duration: data.duration,
              timestamp: new Date().toISOString()
            })
          }
          console.log(`Recording stopped in room ${data.roomId} by teacher ${data.teacherId} (duration: ${data.duration}s)`)
        } catch (error) {
          socket.emit('error', { message: error instanceof Error ? error.message : 'Failed to notify recording stop' })
        }
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

  // WebRTC Signaling Handlers (v1.2.0: Updated to match API contract)
  private handleWebRTCOffer(socket: any, data: { roomId: string; targetPeerId: string; offer: RTCSessionDescriptionInit }) {
    try {
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
      socket.to(data.targetPeerId).emit('webrtc:ice-candidate', {
        fromPeerId: socket.id,  // v1.2.0: Changed from 'from' to 'fromPeerId'
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
