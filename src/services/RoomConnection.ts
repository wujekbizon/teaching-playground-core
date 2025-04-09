import { io, Socket } from 'socket.io-client'
import { EventEmitter } from 'events'
import { User } from '../interfaces/user.interface'
import { WebRTCService } from './WebRTCService'
import { SystemError } from '../interfaces'

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

    this.socket.on('room_state', (state: {
      stream: StreamState | null,
      messages: RoomMessage[],
      participants: string[]
    }) => {
      console.log('Received room state:', state)
      this.messageHistory = state.messages
      this.currentStream = state.stream
      this.emit('room_state_updated', state)
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

    this.socket.on('stream_started', (state: StreamState) => {
      this.currentStream = state
      this.emit('stream_started', state)
    })

    this.socket.on('stream_stopped', () => {
      this.currentStream = null
      this.emit('stream_stopped')
    })

    this.socket.on('user_joined', ({ userId, socketId }) => {
      this.connectedPeers.add(socketId)
      this.emit('user_joined', { userId, socketId })
    })

    this.socket.on('user_left', ({ socketId }) => {
      this.webrtc.closeConnection(socketId)
      this.connectedPeers.delete(socketId)
      this.emit('user_left', { socketId })
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
    this.socket.emit('join_room', this.roomId, this.user.id)
  }

  disconnect() {
    this.shouldReconnect = false
    if (this.socket) {
      console.log('Disconnecting from room:', this.roomId)
      this.socket.emit('leave_room', this.roomId)
      this.socket.disconnect()
      this.socket = null
    }
    this.webrtc.closeAllConnections()
    this.connectedPeers.clear()
    this.isConnected = false
  }

  async startStream(stream: MediaStream, quality: StreamState['quality'] = 'high') {
    if (!this.isConnected || !this.socket) {
      throw new SystemError('NOT_CONNECTED', 'Cannot start stream: no connection')
    }

    console.log('Starting stream with quality:', quality)
    
    // Emit a stream_status_change event before sending to the server
    this.emit('stream_status_change', { isStreaming: true, userId: this.user.id, username: this.user.username });

    this.socket.emit('start_stream', this.roomId, this.user.username, quality)

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

    this.socket?.emit('send_message', this.roomId, {
      userId: this.user.id,
      username: this.user.username,
      content
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
} 