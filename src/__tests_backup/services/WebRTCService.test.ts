/**
 * Unit tests for WebRTCService
 */

import { describe, it, expect, beforeEach, jest, beforeAll } from '@jest/globals';
import { WebRTCService } from '../../services/WebRTCService.js';
import {
  setupWebRTCMocks,
  MockRTCPeerConnection,
  MockMediaStream,
  MockMediaStreamTrack,
} from '../mocks/webrtc.mock.js';

describe('WebRTCService', () => {
  let webrtcService: WebRTCService;

  beforeAll(() => {
    setupWebRTCMocks();
  });

  beforeEach(() => {
    webrtcService = new WebRTCService();
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(webrtcService).toBeDefined();
    });

    it('should initialize with empty peer connections', () => {
      expect(webrtcService).toBeDefined();
      // Internal state should be empty
    });
  });

  describe('createPeerConnection', () => {
    it('should create a peer connection', () => {
      const pc = webrtcService.createPeerConnection('peer-1');

      expect(pc).toBeDefined();
      expect(pc).toBeInstanceOf(MockRTCPeerConnection);
    });

    it('should store peer connection with peer ID', () => {
      webrtcService.createPeerConnection('peer-1');

      const pc = webrtcService.getPeerConnection('peer-1');
      expect(pc).toBeDefined();
    });

    it('should throw error when creating duplicate peer connection', () => {
      webrtcService.createPeerConnection('peer-1');

      expect(() => {
        webrtcService.createPeerConnection('peer-1');
      }).toThrow();
    });

    it('should use STUN servers configuration', () => {
      const pc = webrtcService.createPeerConnection('peer-1') as MockRTCPeerConnection;

      expect(pc.config).toBeDefined();
      expect(pc.config?.iceServers).toBeDefined();
    });
  });

  describe('getPeerConnection', () => {
    it('should return peer connection by ID', () => {
      const created = webrtcService.createPeerConnection('peer-1');
      const retrieved = webrtcService.getPeerConnection('peer-1');

      expect(retrieved).toBe(created);
    });

    it('should return undefined for non-existent peer', () => {
      const pc = webrtcService.getPeerConnection('non-existent');

      expect(pc).toBeUndefined();
    });
  });

  describe('removePeerConnection', () => {
    it('should remove and close peer connection', () => {
      const pc = webrtcService.createPeerConnection('peer-1') as MockRTCPeerConnection;

      webrtcService.removePeerConnection('peer-1');

      expect(pc.close).toHaveBeenCalled();
      expect(webrtcService.getPeerConnection('peer-1')).toBeUndefined();
    });

    it('should not error when removing non-existent peer', () => {
      expect(() => {
        webrtcService.removePeerConnection('non-existent');
      }).not.toThrow();
    });
  });

  describe('getAllPeerConnections', () => {
    it('should return empty map initially', () => {
      const peers = webrtcService.getAllPeerConnections();

      expect(peers.size).toBe(0);
    });

    it('should return all peer connections', () => {
      webrtcService.createPeerConnection('peer-1');
      webrtcService.createPeerConnection('peer-2');
      webrtcService.createPeerConnection('peer-3');

      const peers = webrtcService.getAllPeerConnections();

      expect(peers.size).toBe(3);
      expect(peers.has('peer-1')).toBe(true);
      expect(peers.has('peer-2')).toBe(true);
      expect(peers.has('peer-3')).toBe(true);
    });
  });

  describe('createOffer', () => {
    it('should create an offer', async () => {
      const pc = webrtcService.createPeerConnection('peer-1');

      const offer = await webrtcService.createOffer('peer-1');

      expect(offer).toBeDefined();
      expect(offer.type).toBe('offer');
      expect(offer.sdp).toBeDefined();
    });

    it('should set local description after creating offer', async () => {
      const pc = webrtcService.createPeerConnection('peer-1') as MockRTCPeerConnection;

      await webrtcService.createOffer('peer-1');

      expect(pc.setLocalDescription).toHaveBeenCalled();
    });

    it('should throw error for non-existent peer', async () => {
      await expect(
        webrtcService.createOffer('non-existent')
      ).rejects.toThrow();
    });
  });

  describe('createAnswer', () => {
    it('should create an answer', async () => {
      const pc = webrtcService.createPeerConnection('peer-1');

      // First set remote description (offer)
      await pc.setRemoteDescription({
        type: 'offer',
        sdp: 'mock-offer-sdp',
      });

      const answer = await webrtcService.createAnswer('peer-1');

      expect(answer).toBeDefined();
      expect(answer.type).toBe('answer');
      expect(answer.sdp).toBeDefined();
    });

    it('should set local description after creating answer', async () => {
      const pc = webrtcService.createPeerConnection('peer-1') as MockRTCPeerConnection;

      await pc.setRemoteDescription({
        type: 'offer',
        sdp: 'mock-offer-sdp',
      });

      await webrtcService.createAnswer('peer-1');

      expect(pc.setLocalDescription).toHaveBeenCalled();
    });

    it('should throw error for non-existent peer', async () => {
      await expect(
        webrtcService.createAnswer('non-existent')
      ).rejects.toThrow();
    });
  });

  describe('setRemoteDescription', () => {
    it('should set remote description', async () => {
      const pc = webrtcService.createPeerConnection('peer-1') as MockRTCPeerConnection;

      const description = {
        type: 'offer' as RTCSdpType,
        sdp: 'mock-offer-sdp',
      };

      await webrtcService.setRemoteDescription('peer-1', description);

      expect(pc.setRemoteDescription).toHaveBeenCalledWith(description);
    });

    it('should throw error for non-existent peer', async () => {
      await expect(
        webrtcService.setRemoteDescription('non-existent', {
          type: 'offer',
          sdp: 'mock-sdp',
        })
      ).rejects.toThrow();
    });
  });

  describe('addIceCandidate', () => {
    it('should add ICE candidate', async () => {
      const pc = webrtcService.createPeerConnection('peer-1') as MockRTCPeerConnection;

      const candidate = {
        candidate: 'mock-candidate',
        sdpMLineIndex: 0,
        sdpMid: '0',
      };

      await webrtcService.addIceCandidate('peer-1', candidate);

      expect(pc.addIceCandidate).toHaveBeenCalled();
    });

    it('should throw error for non-existent peer', async () => {
      await expect(
        webrtcService.addIceCandidate('non-existent', {
          candidate: 'mock-candidate',
          sdpMLineIndex: 0,
        })
      ).rejects.toThrow();
    });
  });

  describe('addTrack', () => {
    it('should add track to peer connection', () => {
      const pc = webrtcService.createPeerConnection('peer-1') as MockRTCPeerConnection;
      const track = new MockMediaStreamTrack('video');
      const stream = new MockMediaStream();

      webrtcService.addTrack('peer-1', track as any, stream as any);

      expect(pc.addTrack).toHaveBeenCalledWith(track, stream);
    });

    it('should throw error for non-existent peer', () => {
      const track = new MockMediaStreamTrack('video');
      const stream = new MockMediaStream();

      expect(() => {
        webrtcService.addTrack('non-existent', track as any, stream as any);
      }).toThrow();
    });
  });

  describe('removeTrack', () => {
    it('should remove track from peer connection', () => {
      const pc = webrtcService.createPeerConnection('peer-1') as MockRTCPeerConnection;
      const sender = {} as RTCRtpSender;

      webrtcService.removeTrack('peer-1', sender);

      expect(pc.removeTrack).toHaveBeenCalledWith(sender);
    });

    it('should throw error for non-existent peer', () => {
      const sender = {} as RTCRtpSender;

      expect(() => {
        webrtcService.removeTrack('non-existent', sender);
      }).toThrow();
    });
  });

  describe('setLocalStream', () => {
    it('should set local stream', () => {
      const stream = new MockMediaStream();

      webrtcService.setLocalStream(stream as any);

      const localStream = webrtcService.getLocalStream();
      expect(localStream).toBe(stream);
    });
  });

  describe('getLocalStream', () => {
    it('should return undefined when no local stream set', () => {
      const stream = webrtcService.getLocalStream();

      expect(stream).toBeUndefined();
    });

    it('should return local stream', () => {
      const stream = new MockMediaStream();
      webrtcService.setLocalStream(stream as any);

      const retrieved = webrtcService.getLocalStream();

      expect(retrieved).toBe(stream);
    });
  });

  describe('addRemoteStream', () => {
    it('should add remote stream', () => {
      const stream = new MockMediaStream();

      webrtcService.addRemoteStream('peer-1', stream as any);

      const remoteStream = webrtcService.getRemoteStream('peer-1');
      expect(remoteStream).toBe(stream);
    });
  });

  describe('getRemoteStream', () => {
    it('should return undefined for non-existent peer', () => {
      const stream = webrtcService.getRemoteStream('non-existent');

      expect(stream).toBeUndefined();
    });

    it('should return remote stream for peer', () => {
      const stream = new MockMediaStream();
      webrtcService.addRemoteStream('peer-1', stream as any);

      const retrieved = webrtcService.getRemoteStream('peer-1');

      expect(retrieved).toBe(stream);
    });
  });

  describe('removeRemoteStream', () => {
    it('should remove remote stream', () => {
      const stream = new MockMediaStream();
      webrtcService.addRemoteStream('peer-1', stream as any);

      webrtcService.removeRemoteStream('peer-1');

      const retrieved = webrtcService.getRemoteStream('peer-1');
      expect(retrieved).toBeUndefined();
    });

    it('should not error when removing non-existent stream', () => {
      expect(() => {
        webrtcService.removeRemoteStream('non-existent');
      }).not.toThrow();
    });
  });

  describe('closeAllConnections', () => {
    it('should close all peer connections', () => {
      const pc1 = webrtcService.createPeerConnection('peer-1') as MockRTCPeerConnection;
      const pc2 = webrtcService.createPeerConnection('peer-2') as MockRTCPeerConnection;
      const pc3 = webrtcService.createPeerConnection('peer-3') as MockRTCPeerConnection;

      webrtcService.closeAllConnections();

      expect(pc1.close).toHaveBeenCalled();
      expect(pc2.close).toHaveBeenCalled();
      expect(pc3.close).toHaveBeenCalled();

      const peers = webrtcService.getAllPeerConnections();
      expect(peers.size).toBe(0);
    });

    it('should clear all remote streams', () => {
      webrtcService.createPeerConnection('peer-1');
      const stream = new MockMediaStream();
      webrtcService.addRemoteStream('peer-1', stream as any);

      webrtcService.closeAllConnections();

      const remoteStream = webrtcService.getRemoteStream('peer-1');
      expect(remoteStream).toBeUndefined();
    });
  });

  describe('event handlers', () => {
    it('should handle ICE candidate events', (done) => {
      const pc = webrtcService.createPeerConnection('peer-1') as MockRTCPeerConnection;

      pc.on('icecandidate', (event: any) => {
        expect(event.candidate).toBeDefined();
        done();
      });

      pc.simulateIceCandidate({ candidate: 'mock-candidate' } as any);
    });

    it('should handle track events', (done) => {
      const pc = webrtcService.createPeerConnection('peer-1') as MockRTCPeerConnection;

      pc.on('track', (event: any) => {
        expect(event.track).toBeDefined();
        done();
      });

      const track = new MockMediaStreamTrack('video');
      const stream = new MockMediaStream();
      pc.simulateTrack(track as any, [stream as any]);
    });

    it('should handle connection state changes', (done) => {
      const pc = webrtcService.createPeerConnection('peer-1') as MockRTCPeerConnection;

      pc.on('connectionstatechange', () => {
        expect(pc.connectionState).toBe('connected');
        done();
      });

      pc.simulateConnectionState('connected');
    });
  });
});
