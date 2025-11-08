# Migration Guide: v1.1.x → v1.2.0

## Overview

Version 1.2.0 introduces **WebRTC Media Streaming** with breaking changes to the streaming API. This guide will help you migrate your frontend to the new architecture.

## Breaking Changes

### 1. Streaming API Completely Redesigned

**Before (v1.1.x):**
```typescript
// Old API - DEPRECATED
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
await connection.startStream(stream, 'high');
await connection.stopStream();
```

**After (v1.2.0):**
```typescript
// New API - WebRTC Peer Connections
const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

// Setup peer connection for each participant
await connection.setupPeerConnection(peerId, localStream);

// Initiate WebRTC offer/answer exchange
await connection.createOffer(peerId);
```

### 2. New WebRTC Events Required

You must now handle WebRTC signaling events:

```typescript
connection.on('webrtc_offer', async ({ fromPeerId, offer }) => {
  await connection.handleWebRTCOffer(fromPeerId, offer);
});

connection.on('webrtc_answer', async ({ fromPeerId, answer }) => {
  await connection.handleWebRTCAnswer(fromPeerId, answer);
});

connection.on('ice_candidate', async ({ fromPeerId, candidate }) => {
  await connection.handleWebRTCIceCandidate(fromPeerId, candidate);
});

connection.on('remote_stream_added', ({ peerId, stream }) => {
  // Display remote peer's video
  const videoElement = document.getElementById(`video-${peerId}`);
  videoElement.srcObject = stream;
});
```

### 3. New Screen Sharing API

**Before (v1.1.x):**
```typescript
// Screen sharing not available
```

**After (v1.2.0):**
```typescript
// Start screen sharing
await connection.startScreenShare();

// Stop screen sharing
connection.stopScreenShare();

// Check status
const isSharing = connection.isScreenSharing();

// Events
connection.on('screen_share_started', () => {
  console.log('Screen sharing started');
});

connection.on('screen_share_stopped', () => {
  console.log('Screen sharing stopped');
});
```

## Step-by-Step Migration

### Step 1: Update Package

```bash
npm install @teaching-playground/core@1.2.0
# or
pnpm add @teaching-playground/core@1.2.0
```

### Step 2: Remove Old Streaming Code

Find and remove all instances of:
- `connection.startStream()`
- `connection.stopStream()`
- `connection.getCurrentStream()`

### Step 3: Implement New WebRTC Flow

Create a new video connection handler:

```typescript
// src/hooks/useWebRTC.ts (or similar)
import { RoomConnection } from '@teaching-playground/core';
import { useEffect, useRef, useState } from 'react';

export function useWebRTC(connection: RoomConnection, localStream: MediaStream | null) {
  const [remotePeers, setRemotePeers] = useState<Map<string, MediaStream>>(new Map());
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());

  useEffect(() => {
    if (!connection || !localStream) return;

    // Handle new users joining
    const handleUserJoined = async ({ user }: any) => {
      console.log('User joined:', user.id);

      // Setup peer connection
      const pc = await connection.setupPeerConnection(user.id, localStream);
      peerConnectionsRef.current.set(user.id, pc);

      // Initiate connection as offerer
      await connection.createOffer(user.id);
    };

    // Handle WebRTC offer (you are answerer)
    const handleWebRTCOffer = async ({ fromPeerId, offer }: any) => {
      console.log('Received offer from:', fromPeerId);

      // Setup peer connection if not exists
      if (!peerConnectionsRef.current.has(fromPeerId)) {
        const pc = await connection.setupPeerConnection(fromPeerId, localStream);
        peerConnectionsRef.current.set(fromPeerId, pc);
      }

      // Handle the offer
      await connection.handleWebRTCOffer(fromPeerId, offer);
    };

    // Handle WebRTC answer
    const handleWebRTCAnswer = async ({ fromPeerId, answer }: any) => {
      console.log('Received answer from:', fromPeerId);
      await connection.handleWebRTCAnswer(fromPeerId, answer);
    };

    // Handle ICE candidates
    const handleIceCandidate = async ({ fromPeerId, candidate }: any) => {
      console.log('Received ICE candidate from:', fromPeerId);
      await connection.handleWebRTCIceCandidate(fromPeerId, candidate);
    };

    // Handle remote streams
    const handleRemoteStreamAdded = ({ peerId, stream }: any) => {
      console.log('Remote stream added:', peerId);
      setRemotePeers(prev => new Map(prev).set(peerId, stream));
    };

    const handleRemoteStreamRemoved = (peerId: string) => {
      console.log('Remote stream removed:', peerId);
      setRemotePeers(prev => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
    };

    // Handle user leaving
    const handleUserLeft = ({ userId }: any) => {
      console.log('User left:', userId);
      connection.closePeerConnection(userId);
      peerConnectionsRef.current.delete(userId);
      setRemotePeers(prev => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    };

    // Register event listeners
    connection.on('user_joined', handleUserJoined);
    connection.on('webrtc_offer', handleWebRTCOffer);
    connection.on('webrtc_answer', handleWebRTCAnswer);
    connection.on('ice_candidate', handleIceCandidate);
    connection.on('remote_stream_added', handleRemoteStreamAdded);
    connection.on('stream_removed', handleRemoteStreamRemoved);
    connection.on('user_left', handleUserLeft);

    // Cleanup
    return () => {
      connection.off('user_joined', handleUserJoined);
      connection.off('webrtc_offer', handleWebRTCOffer);
      connection.off('webrtc_answer', handleWebRTCAnswer);
      connection.off('ice_candidate', handleIceCandidate);
      connection.off('remote_stream_added', handleRemoteStreamAdded);
      connection.off('stream_removed', handleRemoteStreamRemoved);
      connection.off('user_left', handleUserLeft);

      // Close all peer connections
      peerConnectionsRef.current.forEach((pc, peerId) => {
        connection.closePeerConnection(peerId);
      });
      peerConnectionsRef.current.clear();
    };
  }, [connection, localStream]);

  return { remotePeers };
}
```

### Step 4: Update Video Components

```typescript
// src/components/VideoRoom.tsx (or similar)
import { useEffect, useRef, useState } from 'react';
import { RoomConnection } from '@teaching-playground/core';
import { useWebRTC } from '../hooks/useWebRTC';

export function VideoRoom({ roomId, user }: { roomId: string; user: any }) {
  const [connection, setConnection] = useState<RoomConnection | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const { remotePeers } = useWebRTC(connection!, localStream);

  // Initialize connection
  useEffect(() => {
    const conn = new RoomConnection(roomId, user, process.env.NEXT_PUBLIC_WS_URL!);

    conn.on('connected', () => {
      console.log('Connected to room');
    });

    conn.on('error', (error) => {
      console.error('Connection error:', error);
    });

    conn.connect();
    setConnection(conn);

    return () => {
      conn.disconnect();
    };
  }, [roomId, user]);

  // Get local media stream
  useEffect(() => {
    let stream: MediaStream | null = null;

    async function getMedia() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: true,
        });

        setLocalStream(stream);

        // Display local video
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      } catch (error) {
        console.error('Failed to get media:', error);
      }
    }

    getMedia();

    return () => {
      // Stop all tracks when unmounting
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  return (
    <div className="video-room">
      {/* Local video */}
      <div className="local-video">
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className="video-element"
        />
        <span>You</span>
      </div>

      {/* Remote videos */}
      <div className="remote-videos">
        {Array.from(remotePeers.entries()).map(([peerId, stream]) => (
          <RemoteVideo key={peerId} peerId={peerId} stream={stream} />
        ))}
      </div>

      {/* Controls */}
      {connection && (
        <VideoControls connection={connection} localStream={localStream} />
      )}
    </div>
  );
}

function RemoteVideo({ peerId, stream }: { peerId: string; stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="remote-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="video-element"
      />
      <span>{peerId}</span>
    </div>
  );
}

function VideoControls({ connection, localStream }: {
  connection: RoomConnection;
  localStream: MediaStream | null;
}) {
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (isScreenSharing) {
        connection.stopScreenShare();
        setIsScreenSharing(false);
      } else {
        await connection.startScreenShare();
        setIsScreenSharing(true);
      }
    } catch (error) {
      console.error('Screen share error:', error);
    }
  };

  useEffect(() => {
    connection.on('screen_share_started', () => setIsScreenSharing(true));
    connection.on('screen_share_stopped', () => setIsScreenSharing(false));
  }, [connection]);

  return (
    <div className="video-controls">
      <button onClick={toggleVideo}>
        {isVideoEnabled ? 'Camera On' : 'Camera Off'}
      </button>
      <button onClick={toggleAudio}>
        {isAudioEnabled ? 'Mic On' : 'Mic Off'}
      </button>
      <button onClick={toggleScreenShare}>
        {isScreenSharing ? 'Stop Sharing' : 'Share Screen'}
      </button>
    </div>
  );
}
```

## Common Issues and Solutions

### Issue 1: Camera doesn't work, buttons disabled

**Cause:** Frontend using old `startStream()` API

**Solution:** Implement new WebRTC flow with `setupPeerConnection()` and signaling events

### Issue 2: User connects then immediately disconnects

**Cause:** Missing WebRTC event handlers causing connection to fail

**Solution:** Add all required WebRTC event listeners (`webrtc_offer`, `webrtc_answer`, `ice_candidate`)

### Issue 3: No remote video appears

**Cause:** Not handling `remote_stream_added` event

**Solution:** Listen for `remote_stream_added` and attach stream to video element

### Issue 4: Room status shows "available" instead of being removed

**Cause:** This is correct behavior - rooms persist after lectures end

**Solution:** Filter rooms by status in UI or hide "available" rooms after lecture

## Testing Your Migration

### 1. Test Local Video
```typescript
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
localVideoElement.srcObject = stream;
// Should see your camera feed
```

### 2. Test Connection
```typescript
connection.on('connected', () => {
  console.log('✅ Connected');
});
connection.connect();
// Should see "✅ Connected" in console
```

### 3. Test Peer Connection
```typescript
// Open two browser tabs
// Both should see each other's video
// Check browser console for WebRTC logs
```

### 4. Test Screen Sharing
```typescript
await connection.startScreenShare();
// Should see screen share dialog
// Remote peers should see your screen
```

## Verification Checklist

- [ ] Package updated to v1.2.0
- [ ] Old `startStream()` calls removed
- [ ] New WebRTC event handlers added
- [ ] `setupPeerConnection()` called for each peer
- [ ] `remote_stream_added` event handled
- [ ] Local video displays correctly
- [ ] Remote videos display correctly
- [ ] Screen sharing works
- [ ] Audio/video toggles work
- [ ] Peer connections cleanup on disconnect

## Need Help?

If you encounter issues during migration:

1. Check browser console for WebRTC errors
2. Use `chrome://webrtc-internals` to debug connections
3. Verify all WebRTC events are being handled
4. Ensure media permissions are granted
5. Check that STUN servers are accessible

## Rollback Plan

If you need to rollback to v1.1.x:

```bash
npm install @teaching-playground/core@1.1.3
# or
pnpm add @teaching-playground/core@1.1.3
```

Note: v1.1.x does not support WebRTC streaming. You'll need to use server-side broadcasting.
