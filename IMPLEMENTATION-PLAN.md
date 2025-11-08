# Teaching Playground - Implementation Plan
## Participant Controls & Advanced Features

**Current Version:** v1.2.0 (WebRTC Media Streaming)
**Target Version:** v1.3.1 → v1.4.0 → v1.5.0
**Strategy:** Build features fast, test between implementations

---

## 🎯 Phase 1: Participant Controls (v1.3.1)

**Timeline:** 2-3 days
**Priority:** P1 - High Value Teaching Features
**Complexity:** Medium

### Features

#### 1. Mute All Participants (Teacher Only)
**Use Case:** Teacher wants to silence all students at once

**Package Implementation:**

```typescript
// src/systems/comms/RealTimeCommunicationSystem.ts

/**
 * Mute all participants in a room (teacher only)
 */
muteAllParticipants(roomId: string, requesterId: string): void {
  const participants = this.roomParticipants.get(roomId);
  if (!participants) return;

  // Verify requester is teacher/admin
  const requester = Array.from(participants.values())
    .find(p => p.id === requesterId);

  if (!requester || (requester.role !== 'teacher' && requester.role !== 'admin')) {
    throw new Error('Only teachers can mute all participants');
  }

  // Emit to all participants
  this.io.to(roomId).emit('mute_all', {
    requestedBy: requesterId,
    timestamp: new Date().toISOString()
  });

  console.log(`All participants muted in room ${roomId} by ${requesterId}`);
}
```

**Client API (RoomConnection.ts):**

```typescript
/**
 * Mute all participants (teacher only)
 */
muteAllParticipants(): void {
  if (this.user.role !== 'teacher' && this.user.role !== 'admin') {
    throw new Error('Only teachers can mute all participants');
  }

  this.socket?.emit('mute_all_participants', {
    roomId: this.roomId,
    requesterId: this.user.id
  });
}

// Event handler
connection.on('mute_all', () => {
  // Frontend mutes mic
  console.log('You have been muted by the teacher');
});
```

**Frontend Integration:**

```typescript
// In teacher controls
<button onClick={() => connection.muteAllParticipants()}>
  Mute All
</button>

// In student component
useEffect(() => {
  connection.on('mute_all', () => {
    // Disable microphone
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
    }
    toast.info('You have been muted by the teacher');
  });
}, [connection]);
```

---

#### 2. Mute Individual Participant (Teacher Only)
**Use Case:** Teacher wants to mute a specific disruptive student

**Package Implementation:**

```typescript
// src/systems/comms/RealTimeCommunicationSystem.ts

/**
 * Mute specific participant (teacher only)
 */
muteParticipant(roomId: string, targetUserId: string, requesterId: string): void {
  const participants = this.roomParticipants.get(roomId);
  if (!participants) return;

  // Verify requester is teacher/admin
  const requester = Array.from(participants.values())
    .find(p => p.id === requesterId);

  if (!requester || (requester.role !== 'teacher' && requester.role !== 'admin')) {
    throw new Error('Only teachers can mute participants');
  }

  // Find target participant's socket
  const targetParticipant = Array.from(participants.values())
    .find(p => p.id === targetUserId);

  if (!targetParticipant) {
    throw new Error('Participant not found');
  }

  // Emit to specific participant
  this.io.to(targetParticipant.socketId).emit('muted_by_teacher', {
    requestedBy: requesterId,
    reason: 'Muted by instructor',
    timestamp: new Date().toISOString()
  });

  console.log(`Participant ${targetUserId} muted in room ${roomId}`);
}
```

**Client API:**

```typescript
/**
 * Mute specific participant (teacher only)
 */
muteParticipant(userId: string): void {
  if (this.user.role !== 'teacher' && this.user.role !== 'admin') {
    throw new Error('Only teachers can mute participants');
  }

  this.socket?.emit('mute_participant', {
    roomId: this.roomId,
    targetUserId: userId,
    requesterId: this.user.id
  });
}

// Event handler
connection.on('muted_by_teacher', ({ requestedBy, reason }) => {
  // Frontend force mutes mic
  console.log(`Muted by teacher: ${reason}`);
});
```

**Frontend Integration:**

```typescript
// Participant list item
<div className="participant-controls">
  {user.role === 'teacher' && (
    <button onClick={() => connection.muteParticipant(participant.id)}>
      <MicOff /> Mute
    </button>
  )}
</div>

// In student component
useEffect(() => {
  connection.on('muted_by_teacher', ({ reason }) => {
    // Force disable microphone
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = false;
      });
    }
    toast.warning(`Muted by teacher: ${reason}`);
  });
}, [connection]);
```

---

#### 3. Kick Participant (Teacher/Admin Only)
**Use Case:** Remove disruptive participant from room

**Package Implementation:**

```typescript
// src/systems/comms/RealTimeCommunicationSystem.ts

/**
 * Kick participant from room (teacher/admin only)
 */
kickParticipant(
  roomId: string,
  targetUserId: string,
  requesterId: string,
  reason?: string
): void {
  const participants = this.roomParticipants.get(roomId);
  if (!participants) return;

  // Verify requester is teacher/admin
  const requester = Array.from(participants.values())
    .find(p => p.id === requesterId);

  if (!requester || (requester.role !== 'teacher' && requester.role !== 'admin')) {
    throw new Error('Only teachers can kick participants');
  }

  // Find target participant
  const targetParticipant = Array.from(participants.values())
    .find(p => p.id === targetUserId);

  if (!targetParticipant) {
    throw new Error('Participant not found');
  }

  // Emit kick event to target
  this.io.to(targetParticipant.socketId).emit('kicked_from_room', {
    roomId,
    reason: reason || 'Removed by instructor',
    kickedBy: requesterId,
    timestamp: new Date().toISOString()
  });

  // Remove from participants
  participants.delete(targetParticipant.socketId);

  // Notify others
  this.io.to(roomId).emit('participant_kicked', {
    userId: targetUserId,
    reason: reason || 'Removed by instructor'
  });

  console.log(`Participant ${targetUserId} kicked from room ${roomId}`);
}
```

**Client API:**

```typescript
/**
 * Kick participant from room (teacher/admin only)
 */
kickParticipant(userId: string, reason?: string): void {
  if (this.user.role !== 'teacher' && this.user.role !== 'admin') {
    throw new Error('Only teachers can kick participants');
  }

  this.socket?.emit('kick_participant', {
    roomId: this.roomId,
    targetUserId: userId,
    requesterId: this.user.id,
    reason
  });
}

// Event handlers
connection.on('kicked_from_room', ({ reason, kickedBy }) => {
  // Force disconnect and redirect
  console.log(`You were removed: ${reason}`);
  connection.disconnect();
});

connection.on('participant_kicked', ({ userId, reason }) => {
  // Update UI to remove participant
  console.log(`${userId} was removed: ${reason}`);
});
```

**Frontend Integration:**

```typescript
// Participant controls
{user.role === 'teacher' && (
  <button
    onClick={() => {
      const reason = prompt('Reason for removal (optional):');
      connection.kickParticipant(participant.id, reason || undefined);
    }}
  >
    <UserX /> Remove
  </button>
)}

// Handle being kicked
useEffect(() => {
  connection.on('kicked_from_room', ({ reason }) => {
    toast.error(`Removed from room: ${reason}`);
    // Redirect to home
    setTimeout(() => router.push('/'), 2000);
  });
}, [connection]);
```

---

#### 4. Hand Raise (Students)
**Use Case:** Student wants to ask a question or participate

**Package Implementation:**

```typescript
// src/systems/comms/RealTimeCommunicationSystem.ts

// Add to RoomParticipant interface
interface RoomParticipant {
  // ... existing fields
  handRaised: boolean;
  handRaisedAt?: string;
}

/**
 * Raise hand
 */
raiseHand(roomId: string, userId: string): void {
  const participants = this.roomParticipants.get(roomId);
  if (!participants) return;

  const participant = Array.from(participants.values())
    .find(p => p.id === userId);

  if (!participant) return;

  // Update participant state
  participant.handRaised = true;
  participant.handRaisedAt = new Date().toISOString();

  // Broadcast to room
  this.io.to(roomId).emit('hand_raised', {
    userId,
    username: participant.username,
    timestamp: participant.handRaisedAt
  });

  console.log(`Hand raised by ${userId} in room ${roomId}`);
}

/**
 * Lower hand
 */
lowerHand(roomId: string, userId: string): void {
  const participants = this.roomParticipants.get(roomId);
  if (!participants) return;

  const participant = Array.from(participants.values())
    .find(p => p.id === userId);

  if (!participant) return;

  // Update participant state
  participant.handRaised = false;
  participant.handRaisedAt = undefined;

  // Broadcast to room
  this.io.to(roomId).emit('hand_lowered', {
    userId,
    timestamp: new Date().toISOString()
  });

  console.log(`Hand lowered by ${userId} in room ${roomId}`);
}
```

**Client API:**

```typescript
/**
 * Raise hand to ask question
 */
raiseHand(): void {
  this.socket?.emit('raise_hand', {
    roomId: this.roomId,
    userId: this.user.id
  });
}

/**
 * Lower hand
 */
lowerHand(): void {
  this.socket?.emit('lower_hand', {
    roomId: this.roomId,
    userId: this.user.id
  });
}

// Event handlers
connection.on('hand_raised', ({ userId, username }) => {
  // Show hand raised indicator
  console.log(`${username} raised their hand`);
});

connection.on('hand_lowered', ({ userId }) => {
  // Remove hand raised indicator
  console.log(`${userId} lowered their hand`);
});
```

**Frontend Integration:**

```typescript
// Student controls
const [handRaised, setHandRaised] = useState(false);

const toggleHand = () => {
  if (handRaised) {
    connection.lowerHand();
    setHandRaised(false);
  } else {
    connection.raiseHand();
    setHandRaised(true);
  }
};

<button onClick={toggleHand} className={handRaised ? 'active' : ''}>
  <Hand /> {handRaised ? 'Lower Hand' : 'Raise Hand'}
</button>

// Participant list - show indicator
{participant.handRaised && (
  <span className="hand-raised-badge">
    ✋ Raised hand
  </span>
)}

// Teacher view - sort raised hands to top
const sortedParticipants = participants.sort((a, b) => {
  if (a.handRaised && !b.handRaised) return -1;
  if (!a.handRaised && b.handRaised) return 1;
  return 0;
});
```

---

### Implementation Steps

#### Step 1: Package Implementation (Day 1 - 6 hours)

**1.1 Update Interfaces**
```typescript
// src/interfaces/comms.interface.ts

export interface RoomParticipant {
  // ... existing fields
  handRaised: boolean;
  handRaisedAt?: string;
}
```

**1.2 Update RealTimeCommunicationSystem**
- Add `muteAllParticipants()` method
- Add `muteParticipant()` method
- Add `kickParticipant()` method
- Add `raiseHand()` method
- Add `lowerHand()` method
- Add server event handlers

**1.3 Update RoomConnection**
- Add client methods
- Add event handlers
- Export in index.ts

#### Step 2: Server Event Handlers (Day 1 - 2 hours)

```typescript
// In RealTimeCommunicationSystem.setupSocketHandlers()

socket.on('mute_all_participants', ({ roomId, requesterId }) => {
  this.muteAllParticipants(roomId, requesterId);
});

socket.on('mute_participant', ({ roomId, targetUserId, requesterId }) => {
  this.muteParticipant(roomId, targetUserId, requesterId);
});

socket.on('kick_participant', ({ roomId, targetUserId, requesterId, reason }) => {
  this.kickParticipant(roomId, targetUserId, requesterId, reason);
});

socket.on('raise_hand', ({ roomId, userId }) => {
  this.raiseHand(roomId, userId);
});

socket.on('lower_hand', ({ roomId, userId }) => {
  this.lowerHand(roomId, userId);
});
```

#### Step 3: Testing Checkpoint (Day 2 - 1 hour)

**Manual Testing:**
1. Open 2 browser tabs (teacher + student)
2. Test mute all
3. Test mute individual
4. Test kick participant
5. Test hand raise/lower

**What to verify:**
- ✅ Events reach correct participants
- ✅ Permission checks work
- ✅ UI updates correctly
- ✅ Edge cases handled (participant not found, etc.)

#### Step 4: Frontend Implementation (Day 2-3 - 4 hours)

Already outlined above in each feature section.

---

## 🚀 Phase 2: Recording (v1.4.0)

**Timeline:** 3-4 days
**Priority:** P2 - High Value for Teachers
**Complexity:** High

### Approach: Client-Side Recording (MVP)

**Why client-side first:**
- ✅ Simpler implementation
- ✅ No server processing needed
- ✅ Works for teacher's POV
- ✅ Can upgrade to server-side later

### Features

#### 1. Start/Stop Recording
**Use Case:** Teacher records lecture for students who missed class

**Package Implementation:**

```typescript
// src/services/RoomConnection.ts

private mediaRecorder: MediaRecorder | null = null;
private recordedChunks: Blob[] = [];
private recordingStartTime: number | null = null;

/**
 * Start recording (teacher only)
 * Records local screen/camera stream
 */
async startRecording(options?: {
  includeAudio?: boolean;
  includeVideo?: boolean;
}): Promise<void> {
  if (this.user.role !== 'teacher' && this.user.role !== 'admin') {
    throw new Error('Only teachers can record lectures');
  }

  if (this.mediaRecorder?.state === 'recording') {
    throw new Error('Already recording');
  }

  // Get stream to record (screen share if active, otherwise camera)
  const streamToRecord = this.screenShareStream || this.localStream;

  if (!streamToRecord) {
    throw new Error('No stream available to record');
  }

  // Create MediaRecorder
  const options = {
    mimeType: 'video/webm;codecs=vp9',
    videoBitsPerSecond: 2500000 // 2.5 Mbps
  };

  this.mediaRecorder = new MediaRecorder(streamToRecord, options);
  this.recordedChunks = [];
  this.recordingStartTime = Date.now();

  // Handle data available
  this.mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      this.recordedChunks.push(event.data);
    }
  };

  // Handle recording stop
  this.mediaRecorder.onstop = () => {
    const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
    const duration = this.recordingStartTime
      ? Math.floor((Date.now() - this.recordingStartTime) / 1000)
      : 0;

    this.emit('recording_stopped', {
      blob,
      duration,
      size: blob.size,
      timestamp: new Date().toISOString()
    });
  };

  // Start recording
  this.mediaRecorder.start(1000); // Collect data every second

  // Emit event
  this.emit('recording_started', {
    timestamp: new Date().toISOString()
  });

  // Notify room
  this.socket?.emit('recording_started', {
    roomId: this.roomId,
    teacherId: this.user.id
  });

  console.log('Recording started');
}

/**
 * Stop recording
 */
stopRecording(): void {
  if (!this.mediaRecorder || this.mediaRecorder.state !== 'recording') {
    throw new Error('Not currently recording');
  }

  this.mediaRecorder.stop();

  // Notify room
  this.socket?.emit('recording_stopped', {
    roomId: this.roomId,
    teacherId: this.user.id,
    duration: this.recordingStartTime
      ? Math.floor((Date.now() - this.recordingStartTime) / 1000)
      : 0
  });

  console.log('Recording stopped');
}

/**
 * Check if currently recording
 */
isRecording(): boolean {
  return this.mediaRecorder?.state === 'recording' || false;
}
```

**Server-side (just for notification):**

```typescript
// In RealTimeCommunicationSystem

socket.on('recording_started', ({ roomId, teacherId }) => {
  // Notify all participants
  this.io.to(roomId).emit('lecture_recording_started', {
    teacherId,
    timestamp: new Date().toISOString()
  });
});

socket.on('recording_stopped', ({ roomId, teacherId, duration }) => {
  // Notify all participants
  this.io.to(roomId).emit('lecture_recording_stopped', {
    teacherId,
    duration,
    timestamp: new Date().toISOString()
  });
});
```

**Frontend Integration:**

```typescript
// Teacher controls
const [recording, setRecording] = useState(false);
const [recordingDuration, setRecordingDuration] = useState(0);

const toggleRecording = async () => {
  if (recording) {
    connection.stopRecording();
  } else {
    await connection.startRecording();
  }
};

// Handle recording events
useEffect(() => {
  connection.on('recording_started', () => {
    setRecording(true);
    toast.success('Recording started');
  });

  connection.on('recording_stopped', ({ blob, duration }) => {
    setRecording(false);
    toast.success(`Recording stopped (${duration}s)`);

    // Offer download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lecture-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // For students - show recording indicator
  connection.on('lecture_recording_started', () => {
    toast.info('This lecture is being recorded');
  });

  connection.on('lecture_recording_stopped', ({ duration }) => {
    toast.info(`Recording ended (${duration}s)`);
  });
}, [connection]);

// UI
<button onClick={toggleRecording} className={recording ? 'recording' : ''}>
  {recording ? (
    <>
      <StopCircle /> Stop Recording ({recordingDuration}s)
    </>
  ) : (
    <>
      <Circle /> Start Recording
    </>
  )}
</button>

{recording && (
  <div className="recording-indicator">
    <span className="red-dot pulse" /> REC {recordingDuration}s
  </div>
)}
```

#### 2. Recording Timer

```typescript
// Update duration every second while recording
useEffect(() => {
  if (!recording) {
    setRecordingDuration(0);
    return;
  }

  const interval = setInterval(() => {
    setRecordingDuration(prev => prev + 1);
  }, 1000);

  return () => clearInterval(interval);
}, [recording]);
```

#### 3. Cloud Upload (Optional Enhancement)

```typescript
// After recording stops
connection.on('recording_stopped', async ({ blob, duration }) => {
  setRecording(false);

  // Option 1: Download locally
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `lecture-${Date.now()}.webm`;
  a.click();

  // Option 2: Upload to cloud (S3, GCS, etc.)
  const formData = new FormData();
  formData.append('file', blob, `lecture-${Date.now()}.webm`);
  formData.append('duration', duration.toString());
  formData.append('roomId', connection.roomId);

  await fetch('/api/recordings/upload', {
    method: 'POST',
    body: formData
  });

  toast.success('Recording uploaded successfully');
});
```

---

## 🚀 Phase 3: Breakout Rooms (v1.5.0)

**Timeline:** 4-5 days
**Priority:** P3 - Advanced Teaching
**Complexity:** Very High

### Architecture

```
Main Room (room_lecture_123)
  ├─ Breakout Room 1 (room_lecture_123_breakout_1)
  ├─ Breakout Room 2 (room_lecture_123_breakout_2)
  └─ Breakout Room 3 (room_lecture_123_breakout_3)
```

### Features

#### 1. Create Breakout Rooms

```typescript
// Package API
connection.createBreakoutRooms({
  count: 3,
  duration: 600, // 10 minutes
  assignmentType: 'automatic' // or 'manual' or 'student-choice'
})

// Server creates sub-rooms
// Automatically assigns participants
// Starts timer
```

#### 2. Assign Participants

```typescript
// Manual assignment
connection.assignToBreakoutRoom(1, ['user1', 'user2', 'user3'])
connection.assignToBreakoutRoom(2, ['user4', 'user5', 'user6'])

// Automatic assignment (random)
connection.autoAssignBreakoutRooms(3) // 3 rooms

// Student choice
connection.enableBreakoutChoice() // Students pick their room
```

#### 3. Monitor Breakout Rooms (Teacher)

```typescript
// Teacher can join any breakout room
connection.joinBreakoutRoom(1) // Join breakout 1
connection.leaveBreakoutRoom() // Return to main room

// Get breakout room status
const status = connection.getBreakoutRoomStatus()
// {
//   room1: { participants: 4, messages: 12 },
//   room2: { participants: 3, messages: 8 },
//   room3: { participants: 5, messages: 15 }
// }
```

#### 4. Broadcast to All Breakouts

```typescript
// Teacher broadcasts message to all breakout rooms
connection.broadcastToBreakoutRooms('5 minutes remaining!')
```

#### 5. Close Breakout Rooms

```typescript
// Automatic after timer
// Or manual close
connection.closeAllBreakoutRooms()

// All students return to main room
```

---

## 📝 Implementation Timeline

### Week 1: Participant Controls (v1.3.1)
```
Day 1: Package implementation (mute, kick, hand raise)
Day 2: Testing + frontend integration
Day 3: Polish + bug fixes
✅ Deliverable: v1.3.1 with participant controls
```

### Week 2-3: Recording (v1.4.0)
```
Day 4-5: Client-side recording implementation
Day 6: Testing with multiple users
Day 7: Cloud upload integration (optional)
Day 8: Polish + documentation
✅ Deliverable: v1.4.0 with recording
```

### Week 4-5: Breakout Rooms (v1.5.0)
```
Day 9-10: Breakout room architecture
Day 11-12: Assignment + monitoring
Day 13-14: Testing + polish
Day 15: Documentation
✅ Deliverable: v1.5.0 with breakout rooms
```

---

## Testing Strategy

### Between Implementations (Not Blocking)

**After Participant Controls:**
- ✅ 2-user test (teacher + student)
- ✅ Test all controls work
- ✅ 15 minutes manual testing
- Continue to next feature

**After Recording:**
- ✅ Record a 2-minute test lecture
- ✅ Verify download works
- ✅ Test with screen sharing
- Continue to next feature

**After Breakout Rooms:**
- ✅ 5-user test (1 teacher, 4 students)
- ✅ Create 2 breakout rooms
- ✅ Test assignment and return
- Release v1.5.0

### Full System Test (Before Launch)

**Once all features complete:**
- 10-user stress test
- Network quality testing
- Cross-browser testing
- Mobile testing
- Performance profiling

---

## 🎯 Priority Order

1. **Participant Controls** (Start Monday)
2. **Recording** (Start Thursday/Friday)
3. **Breakout Rooms** (Start Week 2)

---

## What We're Building

**v1.3.1 Participant Controls:**
- ✅ Mute all
- ✅ Mute individual
- ✅ Kick participant
- ✅ Hand raise/lower

**v1.4.0 Recording:**
- ✅ Start/stop recording
- ✅ Recording timer
- ✅ Download recording
- ✅ Cloud upload (optional)

**v1.5.0 Breakout Rooms:**
- ✅ Create breakout rooms
- ✅ Assign participants
- ✅ Monitor breakouts
- ✅ Broadcast messages
- ✅ Close breakouts

---

## Next Steps

1. **Approve this plan**
2. **Start with Participant Controls**
3. **Test between features**
4. **Ship features incrementally**

Ready to start implementation? 🚀
