/**
 * Mock implementations for WebRTC for testing
 */

import { jest } from '@jest/globals';
import EventEmitter from 'eventemitter3';

export class MockRTCPeerConnection extends EventEmitter {
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  signalingState: RTCSignalingState = 'stable';
  iceConnectionState: RTCIceConnectionState = 'new';
  iceGatheringState: RTCIceGatheringState = 'new';
  connectionState: RTCPeerConnectionState = 'new';

  onicecandidate: ((event: any) => void) | null = null;
  ontrack: ((event: any) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;

  private _localStream: MediaStream | null = null;
  private _remoteStream: MediaStream | null = null;

  constructor(public config?: RTCConfiguration) {
    super();
  }

  createOffer = jest.fn(async (options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> => {
    return {
      type: 'offer' as RTCSdpType,
      sdp: 'mock-offer-sdp',
    };
  });

  createAnswer = jest.fn(async (options?: RTCAnswerOptions): Promise<RTCSessionDescriptionInit> => {
    return {
      type: 'answer' as RTCSdpType,
      sdp: 'mock-answer-sdp',
    };
  });

  setLocalDescription = jest.fn(async (description?: RTCSessionDescriptionInit) => {
    this.localDescription = description as RTCSessionDescription;
    this.signalingState = 'have-local-offer';
  });

  setRemoteDescription = jest.fn(async (description: RTCSessionDescriptionInit) => {
    this.remoteDescription = description as RTCSessionDescription;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';
  });

  addIceCandidate = jest.fn(async (candidate?: RTCIceCandidateInit) => {
    // Simulate ICE candidate added
  });

  addTrack = jest.fn((track: MediaStreamTrack, ...streams: MediaStream[]) => {
    return {} as RTCRtpSender;
  });

  removeTrack = jest.fn((sender: RTCRtpSender) => {
    // Simulate track removal
  });

  addTransceiver = jest.fn((
    trackOrKind: MediaStreamTrack | string,
    init?: RTCRtpTransceiverInit
  ) => {
    return {
      sender: {},
      receiver: {},
      direction: init?.direction || 'sendrecv',
    } as RTCRtpTransceiver;
  });

  getTransceivers = jest.fn(() => {
    return [] as RTCRtpTransceiver[];
  });

  close = jest.fn(() => {
    this.connectionState = 'closed';
    this.iceConnectionState = 'closed';
    if (this.onconnectionstatechange) {
      this.onconnectionstatechange();
    }
  });

  getSenders = jest.fn(() => {
    return [] as RTCRtpSender[];
  });

  getReceivers = jest.fn(() => {
    return [] as RTCRtpReceiver[];
  });

  getStats = jest.fn(async () => {
    return new Map();
  });

  // Helper methods for testing
  simulateIceCandidate = (candidate?: RTCIceCandidate | null) => {
    const event = { candidate };
    if (this.onicecandidate) {
      this.onicecandidate(event);
    }
    this.emit('icecandidate', event);
  };

  simulateTrack = (track: MediaStreamTrack, streams: MediaStream[]) => {
    const event = { track, streams };
    if (this.ontrack) {
      this.ontrack(event);
    }
    this.emit('track', event);
  };

  simulateConnectionState = (state: RTCPeerConnectionState) => {
    this.connectionState = state;
    if (this.onconnectionstatechange) {
      this.onconnectionstatechange();
    }
    this.emit('connectionstatechange');
  };

  simulateIceConnectionState = (state: RTCIceConnectionState) => {
    this.iceConnectionState = state;
    if (this.oniceconnectionstatechange) {
      this.oniceconnectionstatechange();
    }
    this.emit('iceconnectionstatechange');
  };
}

export class MockMediaStream extends EventEmitter {
  id: string;
  active: boolean = true;
  private _tracks: MediaStreamTrack[] = [];

  constructor(id = 'mock-stream-id') {
    super();
    this.id = id;
  }

  getTracks = jest.fn(() => this._tracks);

  getAudioTracks = jest.fn(() =>
    this._tracks.filter(t => t.kind === 'audio')
  );

  getVideoTracks = jest.fn(() =>
    this._tracks.filter(t => t.kind === 'video')
  );

  addTrack = jest.fn((track: MediaStreamTrack) => {
    this._tracks.push(track);
  });

  removeTrack = jest.fn((track: MediaStreamTrack) => {
    this._tracks = this._tracks.filter(t => t !== track);
  });

  clone = jest.fn(() => {
    const cloned = new MockMediaStream(`${this.id}-clone`);
    cloned._tracks = [...this._tracks];
    return cloned;
  });
}

export class MockMediaStreamTrack extends EventEmitter {
  kind: 'audio' | 'video';
  id: string;
  label: string;
  enabled: boolean = true;
  muted: boolean = false;
  readyState: 'live' | 'ended' = 'live';

  constructor(kind: 'audio' | 'video', id = `mock-${kind}-track`) {
    super();
    this.kind = kind;
    this.id = id;
    this.label = `Mock ${kind} track`;
  }

  stop = jest.fn(() => {
    this.readyState = 'ended';
    this.emit('ended');
  });

  clone = jest.fn(() => {
    return new MockMediaStreamTrack(this.kind, `${this.id}-clone`);
  });
}

// Mock SimplePeer
export class MockSimplePeer extends EventEmitter {
  destroyed: boolean = false;
  _pc: MockRTCPeerConnection;

  constructor(public opts?: any) {
    super();
    this._pc = new MockRTCPeerConnection(opts?.config);
  }

  signal = jest.fn((data: any) => {
    // Simulate signaling
    this.emit('signal', data);
  });

  addStream = jest.fn((stream: MediaStream) => {
    // Simulate adding stream
  });

  removeStream = jest.fn((stream: MediaStream) => {
    // Simulate removing stream
  });

  addTrack = jest.fn((track: MediaStreamTrack, stream: MediaStream) => {
    // Simulate adding track
  });

  removeTrack = jest.fn((track: MediaStreamTrack, stream: MediaStream) => {
    // Simulate removing track
  });

  destroy = jest.fn(() => {
    this.destroyed = true;
    this.emit('close');
  });

  send = jest.fn((data: any) => {
    // Simulate sending data
  });

  // Helper methods for testing
  simulateConnect = () => {
    this.emit('connect');
  };

  simulateStream = (stream: MediaStream) => {
    this.emit('stream', stream);
  };

  simulateData = (data: any) => {
    this.emit('data', data);
  };

  simulateError = (error: Error) => {
    this.emit('error', error);
  };

  simulateClose = () => {
    this.emit('close');
  };
}

// Global mocks
export const setupWebRTCMocks = () => {
  // @ts-ignore
  global.RTCPeerConnection = MockRTCPeerConnection;
  // @ts-ignore
  global.MediaStream = MockMediaStream;
  // @ts-ignore
  global.MediaStreamTrack = MockMediaStreamTrack;

  // Mock getUserMedia
  // @ts-ignore
  global.navigator = {
    ...global.navigator,
    mediaDevices: {
      getUserMedia: jest.fn(async (constraints) => {
        const stream = new MockMediaStream();
        if (constraints?.audio) {
          stream.addTrack(new MockMediaStreamTrack('audio'));
        }
        if (constraints?.video) {
          stream.addTrack(new MockMediaStreamTrack('video'));
        }
        return stream;
      }),
    },
  };
};
