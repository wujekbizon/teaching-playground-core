import { io, Socket } from 'socket.io-client'
import { EventEmitter } from 'events'
import { User } from '../interfaces/user.interface'
import { WebRTCService } from './WebRTCService'
import { SystemError } from '../interfaces'

interface RoomMessage {
  messageId: string  // v1.1.0: Added unique message ID
  userId: string
  username: string
  content: string
  timestamp: string
  sequence: number   // v1.1.0: Added sequence number
}

interface StreamState {
  isActive: boolean
  streamerId: string | null
  quality: 'low' | 'medium' | 'high'
}

export class RoomConnection extends EventEmitter {
  private socket: Socket | null = null
  private webrtc: WebRTCService
  private isConnected = false
  private connectedPeers: Set<string> = new Set()
  private messageHistory: RoomMessage[] = []
  private currentStream: StreamState | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private shouldReconnect = true
  private rooms: Map<string, Set<string>> = new Map()
  private streams: Map<string, StreamState> = new Map()
  private messages: Map<string, RoomMessage[]> = new Map()

  // v1.2.0: WebRTC peer connection management
  private peerConnections: Map<string, RTCPeerConnection> = new Map()
  private remoteStreams: Map<string, MediaStream> = new Map()
  private screenShareStream: MediaStream | null = null
  private originalVideoTrack: MediaStreamTrack | null = null

  // v1.4.0: Client-side recording
  private mediaRecorder: MediaRecorder | null = null
  private recordedChunks: Blob[] = []
  private recordingStartTime: number | null = null
  private localStream: MediaStream | null = null

  constructor(
    private roomId: string,
    private user: User,
    private serverUrl: string
  ) {
    super()
    this.webrtc = new WebRTCService()
    this.setupWebRTCEvents()
  }

  private setupWebRTCEvents() {
    this.webrtc.on('iceCandidate', ({ peerId, candidate }) => {
      if (this.isConnected && this.socket) {
        console.log('ICE candidate generated for peer:', peerId)
        this.socket.emit('ice_candidate', {
          roomId: this.roomId,
          peerId,
          candidate
        })
      }
    })

    this.webrtc.on('remoteStream', ({ peerId, stream }) => {
      console.log('Received remote stream from peer:', peerId)
      this.emit('stream_added', { peerId, stream })
    })

    this.webrtc.on('peerDisconnected', (peerId) => {
      console.log('Peer disconnected:', peerId)
      this.emit('stream_removed', peerId)
      this.connectedPeers.delete(peerId)
    })

    this.webrtc.on('negotiationNeeded', async (peerId) => {
      if (this.isConnected && this.socket) {
        console.log('Negotiation needed for peer:', peerId)
        try {
          const offer = await this.webrtc.createOffer(peerId)
          this.socket.emit('offer', {
            roomId: this.roomId,
            to: peerId,
            offer
          })
        } catch (error) {
          console.error('Failed to create offer during negotiation:', error)
        }
      }
    })
  }

  connect() {
    if (this.socket) {
      console.warn('Already connected or connecting')
      return
    }

    console.log('Connecting to server:', this.serverUrl)
    this.shouldReconnect = true
    this.socket = io(this.serverUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      timeout: 10000
    })

    this.setupSocketListeners()
    this.socket.connect()
  }

  private setupSocketListeners() {
    if (!this.socket) return

    this.socket.on('connect', () => {
      console.log('Socket connected, joining room:', this.roomId)
      this.isConnected = true
      this.reconnectAttempts = 0
      this.emit('connected')
      this.joinRoom()
    })

    this.socket.on('connect_error', (error) => {
      console.error('Connection error:', error)
      this.handleReconnect()
    })

    this.socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason)
      this.isConnected = false
      this.emit('disconnected')
      if (this.shouldReconnect) {
        this.handleReconnect()
      }
    })

    // Add listener for 'welcome' event
    this.socket.on('welcome', (data: { message: string, timestamp: string }) => {
      this.emit('welcome', data) // Re-emit for useRoomConnection to pick up
    })

    // v1.1.0: room_state no longer includes messages
    this.socket.on('room_state', (state: {
      stream: StreamState | null,
      participants: any[] // Now full participant objects
    }) => {
      console.log('Received room state:', state)
      this.currentStream = state.stream
      this.emit('room_state', state)

      // Request message history separately
      this.socket?.emit('request_message_history', this.roomId)
    })

    // v1.1.0: New message_history event
    this.socket.on('message_history', (data: { messages: RoomMessage[] }) => {
      console.log('Received message history:', data.messages.length, 'messages')
      this.messageHistory = data.messages
      this.emit('message_history', data.messages)
    })

    this.socket.on('new_message', (message: RoomMessage) => {
      this.messageHistory.push(message)
      if (this.messageHistory.length > 100) {
        this.messageHistory.shift()
      }
      this.emit('message_received', message)
    })

    // WebRTC signaling events
    this.socket.on('offer_received', async ({ from, offer }) => {
      try {
        await this.handleOffer(from, offer)
      } catch (error) {
        console.error('Failed to handle offer:', error)
      }
    })

    this.socket.on('answer_received', async ({ from, answer }) => {
      try {
        await this.handleAnswer(from, answer)
      } catch (error) {
        console.error('Failed to handle answer:', error)
      }
    })

    this.socket.on('ice_candidate_received', async ({ from, candidate }) => {
      try {
        await this.handleIceCandidate(from, candidate)
      } catch (error) {
        console.error('Failed to handle ICE candidate:', error)
      }
    })

    // v1.2.0: New WebRTC signaling event listeners (standardized format)
    this.socket.on('webrtc:offer', async ({ fromPeerId, offer }) => {
      console.log(`Received WebRTC offer from ${fromPeerId}`)
      try {
        await this.handleWebRTCOffer(fromPeerId, offer)
      } catch (error) {
        console.error('Failed to handle WebRTC offer:', error)
      }
    })

    this.socket.on('webrtc:answer', async ({ fromPeerId, answer }) => {
      console.log(`Received WebRTC answer from ${fromPeerId}`)
      try {
        await this.handleWebRTCAnswer(fromPeerId, answer)
      } catch (error) {
        console.error('Failed to handle WebRTC answer:', error)
      }
    })

    this.socket.on('webrtc:ice-candidate', async ({ fromPeerId, candidate }) => {
      console.log(`Received ICE candidate from ${fromPeerId}`)
      try {
        await this.handleWebRTCIceCandidate(fromPeerId, candidate)
      } catch (error) {
        console.error('Failed to handle ICE candidate:', error)
      }
    })

    // v1.1.3: Handle room_cleared event
    this.socket.on('room_cleared', (data: { roomId: string; reason: string; timestamp: string }) => {
      console.log('Room cleared:', data)
      this.emit('room_cleared', data)
      // Clear local state
      this.messageHistory = []
      this.currentStream = null
    })

    this.socket.on('stream_started', (state: StreamState) => {
      this.currentStream = state
      this.emit('stream_started', state)
    })

    this.socket.on('stream_stopped', () => {
      this.currentStream = null
      this.emit('stream_stopped')
    })

    this.socket.on('user_joined', (participant: any) => {
      // v1.1.0: user_joined now sends full participant object
      const socketId = participant.socketId || participant.id
      this.connectedPeers.add(socketId)
      this.emit('user_joined', participant)
    })

    this.socket.on('user_left', (participant: any) => {
      // v1.1.0: user_left now sends full participant object
      const socketId = participant.socketId || participant.id
      this.webrtc.closeConnection(socketId)
      this.connectedPeers.delete(socketId)
      this.emit('user_left', participant)
    })

    // v1.1.0: New room_closed event
    this.socket.on('room_closed', (data: { roomId: string; reason: string; timestamp: string }) => {
      console.log('Room closed:', data)
      this.emit('room_closed', data)
      // Automatically disconnect
      this.disconnect()
    })

    // v1.1.0: New server_shutdown event
    this.socket.on('server_shutdown', (data: { message: string; timestamp: string }) => {
      console.log('Server shutting down:', data)
      this.emit('server_shutdown', data)
    })

    // v1.3.1: Participant control events
    this.socket.on('mute_all', (data: { requestedBy: string; timestamp: string }) => {
      console.log('Mute all requested by:', data.requestedBy)
      this.emit('mute_all', data)
    })

    this.socket.on('muted_by_teacher', (data: { requestedBy: string; reason: string; timestamp: string }) => {
      console.log('Muted by teacher:', data)
      this.emit('muted_by_teacher', data)
    })

    this.socket.on('kicked_from_room', (data: { roomId: string; reason: string; kickedBy: string; timestamp: string }) => {
      console.log('Kicked from room:', data)
      this.emit('kicked_from_room', data)
      // Automatically disconnect when kicked
      this.disconnect()
    })

    this.socket.on('participant_kicked', (data: { userId: string; reason: string }) => {
      console.log('Participant kicked:', data)
      this.emit('participant_kicked', data)
    })

    this.socket.on('hand_raised', (data: { userId: string; username: string; timestamp: string }) => {
      console.log('Hand raised:', data)
      this.emit('hand_raised', data)
    })

    this.socket.on('hand_lowered', (data: { userId: string; timestamp: string }) => {
      console.log('Hand lowered:', data)
      this.emit('hand_lowered', data)
    })

    // v1.4.0: Recording notification events
    this.socket.on('lecture_recording_started', (data: { teacherId: string; timestamp: string }) => {
      console.log('Lecture recording started:', data)
      this.emit('lecture_recording_started', data)
    })

    this.socket.on('lecture_recording_stopped', (data: { teacherId: string; duration: number; timestamp: string }) => {
      console.log('Lecture recording stopped:', data)
      this.emit('lecture_recording_stopped', data)
    })

    this.socket.on('error', (error) => {
      console.error('Socket error:', error)
      this.emit('error', error)
    })
  }

  private handleReconnect() {
    if (!this.shouldReconnect) return

    this.reconnectAttempts++
    if (this.reconnectAttempts <= this.maxReconnectAttempts) {
      console.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`)
      setTimeout(() => {
        if (this.shouldReconnect) {
          this.connect()
        }
      }, this.reconnectDelay * this.reconnectAttempts)
    } else {
      console.error('Max reconnection attempts reached')
      this.emit('error', new Error('Failed to connect after maximum attempts'))
    }
  }

  private joinRoom() {
    if (!this.socket || !this.isConnected) return
    // v1.1.0: Send full user object
    this.socket.emit('join_room', { roomId: this.roomId, user: this.user })
  }

  disconnect() {
    console.log('Initiating disconnect sequence')
    this.shouldReconnect = false
    
    // 1. Clean up WebRTC
    this.webrtc.closeAllConnections()
    console.log('WebRTC connections closed')

    // 2. Disconnect socket
    if (this.socket) {
      console.log('Disconnecting socket')
      this.socket.removeAllListeners() // Critical!
      this.socket.disconnect()
      this.socket = null
    }

    // 3. Clear state
    this.connectedPeers.clear()
    this.isConnected = false
    console.log('Disconnect completed')
  }

  async startStream(stream: MediaStream, quality: StreamState['quality'] = 'high') {
    if (!this.isConnected || !this.socket) {
      throw new SystemError('NOT_CONNECTED', 'Cannot start stream: no connection')
    }

    console.log('Starting stream with quality:', quality)

    // Emit a stream_status_change event before sending to the server
    this.emit('stream_status_change', { isStreaming: true, userId: this.user.id, username: this.user.username });

    // Send as object (v1.1.2 API)
    this.socket.emit('start_stream', {
      roomId: this.roomId,
      username: this.user.username,
      quality
    })

    // Set up WebRTC for each peer in the room
    console.log('Setting up WebRTC for peers:', Array.from(this.connectedPeers))
    for (const peerId of this.connectedPeers) {
      if (peerId !== this.socket.id) {
        try {
          await this.webrtc.addStream(peerId, stream)
          const offer = await this.webrtc.createOffer(peerId)
          this.socket.emit('offer', {
            roomId: this.roomId,
            to: peerId,
            offer
          })
        } catch (error) {
          console.error(`Failed to set up WebRTC with peer ${peerId}:`, error)
        }
      }
    }

    return true
  }

  stopStream() {
    if (!this.isConnected || !this.socket) {
      console.warn('Cannot stop stream: no connection')
      return
    }

    console.log('Stopping stream')
    
    // Emit a stream_status_change event before sending to the server
    this.emit('stream_status_change', { isStreaming: false, userId: this.user.id, username: this.user.username });
    
    this.socket.emit('stop_stream', this.roomId)
    this.webrtc.closeAllConnections()
  }

  sendMessage(content: string) {
    if (!this.isConnected) {
      throw new Error('Not connected to room')
    }

    // v1.1.0: Send with new structure
    this.socket?.emit('send_message', {
      roomId: this.roomId,
      message: {
        userId: this.user.id,
        username: this.user.username,
        content
      }
    })
  }

  getMessageHistory(): RoomMessage[] {
    return [...this.messageHistory]
  }

  getCurrentStream(): StreamState | null {
    return this.currentStream
  }

  getConnectionStatus(): boolean {
    return this.isConnected
  }

  private async handleOffer(from: string, offer: RTCSessionDescriptionInit) {
    try {
      console.log('Handling offer from:', from)
      const answer = await this.webrtc.handleOffer(from, offer)
      this.socket?.emit('answer', {
        roomId: this.roomId,
        to: from,
        answer
      })
    } catch (error) {
      console.error('Failed to handle offer:', error)
    }
  }

  private async handleAnswer(from: string, answer: RTCSessionDescriptionInit) {
    try {
      console.log('Handling answer from:', from)
      await this.webrtc.handleAnswer(from, answer)
    } catch (error) {
      console.error('Failed to handle answer:', error)
    }
  }

  private async handleIceCandidate(from: string, candidate: RTCIceCandidate) {
    try {
      console.log('Handling ICE candidate from:', from)
      await this.webrtc.handleIceCandidate(from, candidate)
    } catch (error) {
      console.error('Failed to handle ICE candidate:', error)
    }
  }

  /**
   * v1.2.0: Setup WebRTC peer connection with another participant
   * @param peerId - Socket ID of the remote peer
   * @param localStream - Local media stream to send
   */
  async setupPeerConnection(
    peerId: string,
    localStream: MediaStream
  ): Promise<RTCPeerConnection> {
    const iceServers = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }

    const pc = new RTCPeerConnection(iceServers)

    // Add local tracks to connection
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream)
    })

    // Handle incoming remote tracks
    pc.ontrack = (event) => {
      console.log(`Received remote track from ${peerId}`)
      this.remoteStreams.set(peerId, event.streams[0])

      // Emit to frontend
      this.emit('remote_stream_added', {
        peerId,
        stream: event.streams[0]
      })
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && this.socket) {
        this.socket.emit('webrtc:ice-candidate', {
          targetPeerId: peerId,
          candidate: event.candidate
        })
      }
    }

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Peer connection state with ${peerId}: ${pc.connectionState}`)

      if (pc.connectionState === 'disconnected' ||
          pc.connectionState === 'failed' ||
          pc.connectionState === 'closed') {
        this.remoteStreams.delete(peerId)
        this.emit('remote_stream_removed', { peerId })
      }
    }

    this.peerConnections.set(peerId, pc)
    return pc
  }

  /**
   * v1.2.0: Create WebRTC offer and send to peer
   * @param peerId - Target peer socket ID
   */
  async createOffer(peerId: string): Promise<void> {
    const pc = this.peerConnections.get(peerId)
    if (!pc) {
      throw new Error(`No peer connection found for ${peerId}`)
    }

    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    })

    await pc.setLocalDescription(offer)

    if (this.socket) {
      this.socket.emit('webrtc:offer', {
        targetPeerId: peerId,
        offer: pc.localDescription
      })
    }

    console.log(`Sent WebRTC offer to ${peerId}`)
  }

  /**
   * v1.2.0: Handle incoming WebRTC offer from peer
   * @param fromPeerId - Peer who sent the offer
   * @param offer - SDP offer
   */
  async handleWebRTCOffer(
    fromPeerId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<void> {
    const pc = this.peerConnections.get(fromPeerId)
    if (!pc) {
      throw new Error(`No peer connection found for ${fromPeerId}`)
    }

    await pc.setRemoteDescription(new RTCSessionDescription(offer))

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    if (this.socket) {
      this.socket.emit('webrtc:answer', {
        targetPeerId: fromPeerId,
        answer: pc.localDescription
      })
    }

    console.log(`Sent WebRTC answer to ${fromPeerId}`)
  }

  /**
   * v1.2.0: Handle incoming WebRTC answer from peer
   * @param fromPeerId - Peer who sent the answer
   * @param answer - SDP answer
   */
  async handleWebRTCAnswer(
    fromPeerId: string,
    answer: RTCSessionDescriptionInit
  ): Promise<void> {
    const pc = this.peerConnections.get(fromPeerId)
    if (!pc) {
      throw new Error(`No peer connection found for ${fromPeerId}`)
    }

    await pc.setRemoteDescription(new RTCSessionDescription(answer))
    console.log(`Received WebRTC answer from ${fromPeerId}`)
  }

  /**
   * v1.2.0: Handle incoming ICE candidate from peer
   * @param fromPeerId - Peer who sent the candidate
   * @param candidate - ICE candidate
   */
  async handleWebRTCIceCandidate(
    fromPeerId: string,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    const pc = this.peerConnections.get(fromPeerId)
    if (!pc) {
      console.warn(`No peer connection found for ${fromPeerId}`)
      return
    }

    await pc.addIceCandidate(new RTCIceCandidate(candidate))
    console.log(`Added ICE candidate from ${fromPeerId}`)
  }

  /**
   * v1.2.0: Cleanup peer connection
   * @param peerId - Peer to disconnect from
   */
  closePeerConnection(peerId: string): void {
    const pc = this.peerConnections.get(peerId)
    if (pc) {
      pc.close()
      this.peerConnections.delete(peerId)
      this.remoteStreams.delete(peerId)
    }
  }

  /**
   * v1.2.0: Get remote stream for a specific peer
   * @param peerId - Peer socket ID
   */
  getRemoteStream(peerId: string): MediaStream | undefined {
    return this.remoteStreams.get(peerId)
  }

  /**
   * v1.2.0: Get all remote streams
   */
  getAllRemoteStreams(): Map<string, MediaStream> {
    return this.remoteStreams
  }

  /**
   * v1.3.0: Start screen sharing
   * Replaces camera video with screen video in all peer connections
   */
  async startScreenShare(): Promise<MediaStream> {
    try {
      // Get screen share stream
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always',
          displaySurface: 'monitor'
        } as any,  // Type assertion needed for screen capture constraints
        audio: false
      })

      this.screenShareStream = screenStream
      const screenTrack = screenStream.getVideoTracks()[0]

      // Replace video track in all peer connections
      this.peerConnections.forEach((pc, peerId) => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) {
          // Save original camera track
          this.originalVideoTrack = sender.track
          // Replace with screen track
          sender.replaceTrack(screenTrack)
        }
      })

      // Handle screen share stop (user clicks "Stop Sharing" in browser)
      screenTrack.onended = () => {
        this.stopScreenShare()
      }

      this.emit('screen_share_started')

      return screenStream
    } catch (error) {
      console.error('Failed to start screen share:', error)
      throw error
    }
  }

  /**
   * v1.3.0: Stop screen sharing
   * Switches back to camera video
   */
  stopScreenShare(): void {
    if (!this.screenShareStream) return

    // Stop screen tracks
    this.screenShareStream.getTracks().forEach(track => track.stop())

    // Switch back to camera in all peer connections
    if (this.originalVideoTrack) {
      this.peerConnections.forEach(pc => {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) {
          sender.replaceTrack(this.originalVideoTrack!)
        }
      })
    }

    this.screenShareStream = null
    this.originalVideoTrack = null

    this.emit('screen_share_stopped')
  }

  /**
   * v1.3.0: Check if currently screen sharing
   */
  isScreenSharing(): boolean {
    return this.screenShareStream !== null
  }

  /**
   * v1.3.1: Mute all participants (teacher/admin only)
   * Emits mute_all_participants event to server
   */
  muteAllParticipants(): void {
    if (this.user.role !== 'teacher' && this.user.role !== 'admin') {
      throw new SystemError('PERMISSION_DENIED', 'Only teachers/admins can mute all participants')
    }

    if (!this.isConnected || !this.socket) {
      throw new SystemError('NOT_CONNECTED', 'Cannot mute participants: not connected')
    }

    this.socket.emit('mute_all_participants', {
      roomId: this.roomId,
      requesterId: this.user.id
    })

    console.log('Mute all participants requested')
  }

  /**
   * v1.3.1: Mute specific participant (teacher/admin only)
   * @param userId - User ID of participant to mute
   */
  muteParticipant(userId: string): void {
    if (this.user.role !== 'teacher' && this.user.role !== 'admin') {
      throw new SystemError('PERMISSION_DENIED', 'Only teachers/admins can mute participants')
    }

    if (!this.isConnected || !this.socket) {
      throw new SystemError('NOT_CONNECTED', 'Cannot mute participant: not connected')
    }

    this.socket.emit('mute_participant', {
      roomId: this.roomId,
      targetUserId: userId,
      requesterId: this.user.id
    })

    console.log(`Mute participant requested: ${userId}`)
  }

  /**
   * v1.3.1: Kick participant from room (teacher/admin only)
   * @param userId - User ID of participant to kick
   * @param reason - Optional reason for kicking
   */
  kickParticipant(userId: string, reason?: string): void {
    if (this.user.role !== 'teacher' && this.user.role !== 'admin') {
      throw new SystemError('PERMISSION_DENIED', 'Only teachers/admins can kick participants')
    }

    if (!this.isConnected || !this.socket) {
      throw new SystemError('NOT_CONNECTED', 'Cannot kick participant: not connected')
    }

    this.socket.emit('kick_participant', {
      roomId: this.roomId,
      targetUserId: userId,
      requesterId: this.user.id,
      reason
    })

    console.log(`Kick participant requested: ${userId}`)
  }

  /**
   * v1.3.1: Raise hand to ask question
   */
  raiseHand(): void {
    if (!this.isConnected || !this.socket) {
      throw new SystemError('NOT_CONNECTED', 'Cannot raise hand: not connected')
    }

    this.socket.emit('raise_hand', {
      roomId: this.roomId,
      userId: this.user.id
    })

    console.log('Hand raised')
  }

  /**
   * v1.3.1: Lower hand
   */
  lowerHand(): void {
    if (!this.isConnected || !this.socket) {
      throw new SystemError('NOT_CONNECTED', 'Cannot lower hand: not connected')
    }

    this.socket.emit('lower_hand', {
      roomId: this.roomId,
      userId: this.user.id
    })

    console.log('Hand lowered')
  }

  /**
   * v1.4.0: Start recording lecture (teacher/admin only)
   * Records local screen/camera stream using MediaRecorder API
   * @param stream - MediaStream to record (screen share or camera)
   * @param options - Recording options
   */
  async startRecording(
    stream: MediaStream,
    options?: {
      mimeType?: string
      videoBitsPerSecond?: number
    }
  ): Promise<void> {
    if (this.user.role !== 'teacher' && this.user.role !== 'admin') {
      throw new SystemError('PERMISSION_DENIED', 'Only teachers/admins can record lectures')
    }

    if (!this.isConnected || !this.socket) {
      throw new SystemError('NOT_CONNECTED', 'Cannot start recording: not connected')
    }

    if (this.mediaRecorder?.state === 'recording') {
      throw new SystemError('ALREADY_RECORDING', 'Recording already in progress')
    }

    if (!stream) {
      throw new SystemError('NO_STREAM', 'No stream available to record')
    }

    // Store stream reference
    this.localStream = stream

    // Determine best mimeType
    const mimeType = options?.mimeType || this.getSupportedMimeType()
    const videoBitsPerSecond = options?.videoBitsPerSecond || 2500000 // 2.5 Mbps

    try {
      // Create MediaRecorder
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond
      })

      this.recordedChunks = []
      this.recordingStartTime = Date.now()

      // Handle data available
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data)
        }
      }

      // Handle recording stop
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: mimeType })
        const duration = this.recordingStartTime
          ? Math.floor((Date.now() - this.recordingStartTime) / 1000)
          : 0

        this.emit('recording_stopped', {
          blob,
          duration,
          size: blob.size,
          mimeType,
          timestamp: new Date().toISOString()
        })

        console.log(`Recording stopped - Duration: ${duration}s, Size: ${blob.size} bytes`)
      }

      // Handle errors
      this.mediaRecorder.onerror = (event: Event) => {
        console.error('MediaRecorder error:', event)
        this.emit('recording_error', {
          error: 'Recording failed',
          timestamp: new Date().toISOString()
        })
      }

      // Start recording (collect data every second)
      this.mediaRecorder.start(1000)

      // Emit local event
      this.emit('recording_started', {
        timestamp: new Date().toISOString()
      })

      // Notify room participants
      this.socket.emit('recording_started', {
        roomId: this.roomId,
        teacherId: this.user.id
      })

      console.log('Recording started')
    } catch (error) {
      console.error('Failed to start recording:', error)
      throw new SystemError('RECORDING_FAILED', `Failed to start recording: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * v1.4.0: Stop recording
   */
  stopRecording(): void {
    if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
      throw new SystemError('NOT_RECORDING', 'No recording in progress')
    }

    if (!this.socket) {
      throw new SystemError('NOT_CONNECTED', 'Cannot stop recording: not connected')
    }

    const duration = this.recordingStartTime
      ? Math.floor((Date.now() - this.recordingStartTime) / 1000)
      : 0

    // Stop the recorder (this will trigger onstop event)
    this.mediaRecorder.stop()

    // Notify room participants
    this.socket.emit('recording_stopped', {
      roomId: this.roomId,
      teacherId: this.user.id,
      duration
    })

    console.log('Recording stopped')
  }

  /**
   * v1.4.0: Check if currently recording
   */
  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording'
  }

  /**
   * v1.4.0: Get recording duration in seconds
   */
  getRecordingDuration(): number {
    if (!this.recordingStartTime || !this.isRecording()) {
      return 0
    }
    return Math.floor((Date.now() - this.recordingStartTime) / 1000)
  }

  /**
   * v1.4.0: Get supported MIME type for recording
   */
  private getSupportedMimeType(): string {
    const types = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=h264,opus',
      'video/webm',
      'video/mp4'
    ]

    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) {
        return type
      }
    }

    // Fallback
    return 'video/webm'
  }
} 