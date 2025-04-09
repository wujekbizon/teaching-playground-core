import { EventEmitter } from 'events'

export class WebRTCService extends EventEmitter {
  private peerConnections: Map<string, RTCPeerConnection> = new Map()
  private localStream: MediaStream | null = null
  private configuration: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ]
  }
  private transceivers: Map<string, RTCRtpTransceiver[]> = new Map()

  async setLocalStream(stream: MediaStream) {
    try {
      if (this.localStream) {
        // Stop old tracks
        this.localStream.getTracks().forEach(track => track.stop())
      }
      
      this.localStream = stream
      console.log('Local stream set:', stream.id)
      
      // Add tracks to all existing peer connections
      for (const [peerId, pc] of this.peerConnections.entries()) {
        console.log('Adding tracks to existing peer:', peerId)
        
        // Remove existing transceivers
        const existingTransceivers = this.transceivers.get(peerId) || []
        existingTransceivers.forEach(transceiver => {
          if (transceiver.sender) {
            pc.removeTrack(transceiver.sender)
          }
        })
        
        // Add new transceivers
        const newTransceivers: RTCRtpTransceiver[] = []
        stream.getTracks().forEach(track => {
          const transceiver = pc.addTransceiver(track, {
            direction: 'sendonly',
            streams: [stream]
          })
          newTransceivers.push(transceiver)
        })
        this.transceivers.set(peerId, newTransceivers)
      }
    } catch (error) {
      console.error('Error setting local stream:', error)
      throw error
    }
  }

  async addStream(peerId: string, stream: MediaStream): Promise<void> {
    console.log(`Adding stream to peer: ${peerId}`);
    await this.setLocalStream(stream);
    
    let pc = this.peerConnections.get(peerId);
    if (!pc) {
      pc = await this.createPeerConnection(peerId);
    }
  }

  private async createPeerConnection(peerId: string): Promise<RTCPeerConnection> {
    console.log('Creating new peer connection for:', peerId)
    const pc = new RTCPeerConnection(this.configuration)

    // Add local stream tracks if available
    if (this.localStream) {
      console.log('Adding local tracks to new peer connection')
      const transceivers: RTCRtpTransceiver[] = []
      this.localStream.getTracks().forEach(track => {
        const transceiver = pc.addTransceiver(track, {
          direction: 'sendonly',
          streams: [this.localStream!]
        })
        transceivers.push(transceiver)
      })
      this.transceivers.set(peerId, transceivers)
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('New ICE candidate for peer:', peerId)
        this.emit('iceCandidate', { peerId, candidate: event.candidate })
      }
    }

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Connection state changed for peer ${peerId}:`, pc.connectionState)
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this.emit('peerDisconnected', peerId)
        this.peerConnections.delete(peerId)
        this.transceivers.delete(peerId)
      }
    }

    // Handle remote tracks
    pc.ontrack = (event) => {
      console.log('Received remote track from peer:', peerId)
      const [remoteStream] = event.streams
      this.emit('remoteStream', { peerId, stream: remoteStream })
    }

    this.peerConnections.set(peerId, pc)
    return pc
  }

  async createOffer(peerId: string): Promise<RTCSessionDescriptionInit> {
    console.log('Creating offer for peer:', peerId)
    let pc = this.peerConnections.get(peerId)
    if (!pc) {
      pc = await this.createPeerConnection(peerId)
    }

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      })
      await pc.setLocalDescription(offer)
      return offer
    } catch (error) {
      console.error('Error creating offer:', error)
      throw error
    }
  }

  async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    console.log('Handling offer from peer:', peerId)
    let pc = this.peerConnections.get(peerId)
    if (!pc) {
      pc = await this.createPeerConnection(peerId)
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      return answer
    } catch (error) {
      console.error('Error handling offer:', error)
      throw error
    }
  }

  async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit) {
    console.log('Handling answer from peer:', peerId)
    const pc = this.peerConnections.get(peerId)
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer))
      } catch (error) {
        console.error('Error handling answer:', error)
        throw error
      }
    }
  }

  async handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit) {
    console.log('Handling ICE candidate for peer:', peerId)
    const pc = this.peerConnections.get(peerId)
    if (pc) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (error) {
        console.error('Error handling ICE candidate:', error)
        throw error
      }
    }
  }

  closeConnection(peerId: string) {
    console.log('Closing connection with peer:', peerId)
    const pc = this.peerConnections.get(peerId)
    if (pc) {
      pc.close()
      this.peerConnections.delete(peerId)
      this.transceivers.delete(peerId)
    }
  }

  closeAllConnections() {
    console.log('Closing all peer connections')
    this.peerConnections.forEach((pc, peerId) => {
      pc.close()
      this.peerConnections.delete(peerId)
      this.transceivers.delete(peerId)
    })
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop())
      this.localStream = null
    }
  }
} 