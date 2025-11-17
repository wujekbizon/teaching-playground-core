# WebSocket Backend - Technical Flow Documentation

## Wake-Up-At-1AM Documentation

This document explains EXACTLY how your Teaching Playground WebSocket backend works, from connection to disconnection, in simple but technical terms.

---

## Architecture Overview

```
DATABASE (JsonDatabase)          WEBSOCKET (RealTimeCommunicationSystem)
- Lectures (persistent)          - Active participants (ephemeral)
- Rooms (persistent)              - Chat messages (ephemeral)
- Status (active/completed)       - Video streams (ephemeral)
                                  - WebRTC connections (ephemeral)
```

**Key Principle:** Database stores what survives a restart. WebSocket stores what disappears when users disconnect.

---

## Connection Flow

### 1. Server Startup

```typescript
// scripts/start-ws-server.ts
HTTP Server starts → Port 3001
RealTimeCommunicationSystem.initialize(server)
- Socket.IO server created with CORS
- Event handlers registered
- Automatic cleanup timer started (every 5 minutes)
```

**Logs:**
```
🚀 Starting Teaching Playground WebSocket Server...
📡 Port: 3001
RealTimeCommunicationSystem initialized
Automatic room cleanup started
✅ WebSocket Server is running!
```

### 2. Client Connection

```typescript
// Frontend: connection.connect()
Client opens WebSocket → Socket.IO handshake
Server: 'connection' event fired
```

**Logs:**
```
Client connected: 6e17b0HquT9pIIT7AAAB
```

**What happens:**
- Socket.IO assigns unique socket ID
- Server registers all event listeners for this socket
- Client receives `connect` event

### 3. Joining Room

```typescript
// Frontend: Automatically called after connect
socket.emit('join_room', {
  roomId: 'room_lecture_1763405529118',
  user: {
    id: 'user_358mBnP6UEoMVGz81Q3GoGEzda0',
    username: 'wujekbizon@gmail.com',
    role: 'teacher'
  }
})

// Backend: handleJoinRoom()
1. socket.join(roomId) - Socket.IO room join
2. Create RoomParticipant object with full user info
3. Add to this.rooms Map (in-memory)
4. Update room activity timestamp
5. Send 'welcome' event to joining user
6. Send 'room_state' to joining user (all participants, no messages)
7. Emit 'user_joined' to OTHER participants (not to self)
```

**Logs:**
```
User wujekbizon@gmail.com (6e17b0HquT9pIIT7AAAB) joined room room_lecture_1763405529118
Room room_lecture_1763405529118 now has 1 participants: [
  { id: 'user_358mBnP6UEoMVGz81Q3GoGEzda0', username: 'wujekbizon@gmail.com', socketId: '6e17b0HquT9pIIT7AAAB' }
]
Emitting 'user_joined' to 0 existing participants: []
```

**Client receives:**
```typescript
connection.on('welcome', ({ message, timestamp }) => { /* ... */ })
connection.on('room_state', ({ stream, participants }) => {
  // participants = array of RoomParticipant objects
  // stream = StreamState or null
})
connection.on('message_history', ({ messages }) => { /* ... */ })
```

---

## Second User Joins (Critical Flow)

```typescript
// Second user connects and joins
Client connected: OAW1CsHh75cIZsrSAAAD
socket.emit('join_room', { roomId, user: { id: 'user_35C...', username: 'grzegorz.wolfinger@gmail.com', role: 'student' } })

// Backend: handleJoinRoom()
1. socket.join(roomId)
2. Add student to participants Map
3. Send 'welcome' to student
4. Send 'room_state' to student (includes teacher + student)
5. Emit 'user_joined' to teacher (1 existing participant)
```

**Logs:**
```
User grzegorz.wolfinger@gmail.com (OAW1CsHh75cIZsrSAAAD) joined room room_lecture_1763405529118
Room room_lecture_1763405529118 now has 2 participants: [
  { id: 'user_358mBnP6UEoMVGz81Q3GoGEzda0', username: 'wujekbizon@gmail.com', socketId: '6e17b0HquT9pIIT7AAAB' },
  { id: 'user_35CHlksJp30UR5okOLTnBu3yAeM', username: 'grzegorz.wolfinger@gmail.com', socketId: 'OAW1CsHh75cIZsrSAAAD' }
]
Emitting 'user_joined' to 1 existing participants: [
  { userId: 'user_358mBnP6UEoMVGz81Q3GoGEzda0', username: 'wujekbizon@gmail.com', socketId: '6e17b0HquT9pIIT7AAAB' }
]
```

**What teacher receives:**
```typescript
connection.on('user_joined', ({ userId, username, socketId, role }) => {
  // Teacher's frontend: Create peer connection for this socketId
  await setupPeerConnection(socketId, localStream)
  await createOffer(socketId)
})
```

---

## WebRTC Video Connection (Peer-to-Peer)

### Phase 1: Offer Creation (Teacher → Student)

```typescript
// Teacher frontend: Detects new user_joined event
await setupPeerConnection(studentSocketId, teacherStream)
- Creates RTCPeerConnection
- Adds teacher's video/audio tracks
- Sets up ICE candidate handling
- Sets up remote stream handling

await createOffer(studentSocketId)
- Creates SDP offer
- Sets local description
- Emits to server
```

**Backend relays:**
```typescript
socket.on('webrtc:offer', (data) => {
  // Simply relay to target peer
  socket.to(targetPeerId).emit('webrtc:offer', {
    fromPeerId: socket.id,
    offer: data.offer
  })
})
```

**Logs:**
```
WebRTC offer sent from 6e17b0HquT9pIIT7AAAB to OAW1CsHh75cIZsrSAAAD
```

### Phase 2: Answer Creation (Student → Teacher)

```typescript
// Student frontend: Receives webrtc:offer
connection.on('webrtc:offer', async ({ fromPeerId, offer }) => {
  await setupPeerConnection(fromPeerId, studentStream) // May be null if student hasn't started camera
  await handleWebRTCOffer(fromPeerId, offer)
  - Sets remote description
  - Creates answer
  - Sets local description
  - Emits answer to server
})
```

**Backend relays:**
```typescript
socket.on('webrtc:answer', (data) => {
  socket.to(targetPeerId).emit('webrtc:answer', {
    fromPeerId: socket.id,
    answer: data.answer
  })
})
```

**Logs:**
```
WebRTC answer sent from OAW1CsHh75cIZsrSAAAD to 6e17b0HquT9pIIT7AAAB
```

### Phase 3: ICE Candidate Exchange (Both Ways)

```typescript
// Both peers exchange ICE candidates
peerConnection.on('icecandidate', (event) => {
  if (event.candidate) {
    socket.emit('webrtc:ice-candidate', {
      targetPeerId: remotePeerId,
      candidate: event.candidate
    })
  }
})
```

**Backend relays:**
```typescript
socket.on('webrtc:ice-candidate', (data) => {
  socket.to(data.targetPeerId).emit('webrtc:ice-candidate', {
    fromPeerId: socket.id,
    candidate: data.candidate
  })
})
```

**Result:** Direct peer-to-peer video/audio connection established. Video/audio flows DIRECTLY between browsers, NOT through server.

**Why offer/answer twice in logs?**
Both users turn on video feed, so:
1. Teacher → Student (offer + answer)
2. Student → Teacher (offer + answer)

This is normal WebRTC full-duplex connection setup.

---

## Participant Controls

### Hand Raise/Lower

```typescript
// Student frontend
connection.raiseHand()
- Emits 'raise_hand' event

// Backend: raiseHand()
1. Find participant in room
2. Set participant.handRaised = true
3. Set participant.handRaisedAt = timestamp
4. Broadcast 'hand_raised' to room
```

**Logs:**
```
Hand raised by user_35CHlksJp30UR5okOLTnBu3yAeM in room room_lecture_1763405529118
Hand lowered by user_35CHlksJp30UR5okOLTnBu3yAeM in room room_lecture_1763405529118
```

**Teacher frontend receives:**
```typescript
connection.on('hand_raised', ({ userId, username, timestamp }) => {
  // Show hand raise indicator for this user
})
```

### Mute Participant

```typescript
// Teacher frontend
connection.muteParticipant(studentUserId)
- Emits 'mute_participant' event

// Backend: muteParticipant()
1. Verify requester is teacher/admin
2. Find target participant
3. Emit 'muted_by_teacher' to target socket ONLY
```

**Logs:**
```
Muting participant user_35CHlksJp30UR5okOLTnBu3yAeM (grzegorz.wolfinger@gmail.com, socket: OAW1CsHh75cIZsrSAAAD) in room room_lecture_1763405529118 by user_358mBnP6UEoMVGz81Q3GoGEzda0
Participant user_35CHlksJp30UR5okOLTnBu3yAeM successfully muted in room room_lecture_1763405529118
```

**Student frontend receives:**
```typescript
connection.on('muted_by_teacher', ({ requestedBy, reason, timestamp }) => {
  // MUST disable microphone track
  localStream.getAudioTracks()[0].enabled = false
})
```

**ISSUE:** Backend works correctly. Frontend not implementing this event handler.

### Mute All

```typescript
// Teacher frontend
connection.muteAllParticipants()
- Emits 'mute_all_participants' event

// Backend: muteAllParticipants()
1. Verify requester is teacher/admin
2. Emit 'mute_all' to ENTIRE ROOM
```

**Logs:**
```
Muting all participants in room room_lecture_1763405529118 by user_358mBnP6UEoMVGz81Q3GoGEzda0 (wujekbizon@gmail.com)
All participants muted in room room_lecture_1763405529118 by user_358mBnP6UEoMVGz81Q3GoGEzda0
```

**All participants receive:**
```typescript
connection.on('mute_all', ({ requestedBy, timestamp }) => {
  // MUST disable microphone track
  localStream.getAudioTracks()[0].enabled = false
})
```

**ISSUE:** Backend works correctly. Frontend not implementing this event handler.

### Kick Participant

```typescript
// Teacher frontend
connection.kickParticipant(studentUserId, 'Removed by teacher')
- Emits 'kick_participant' event

// Backend: kickParticipant()
1. Verify requester is teacher/admin
2. Find target participant
3. Emit 'kicked_from_room' to target socket
4. Emit 'participant_kicked' to room (notification)
5. Remove participant from Map
6. After 1 second delay: FORCE DISCONNECT target socket
```

**Logs:**
```
Kick participant event received - Room: room_lecture_1763405529118, Target: user_35CHlksJp30UR5okOLTnBu3yAeM, Requester: user_358mBnP6UEoMVGz81Q3GoGEzda0, Reason: Removed by teacher
Kicking participant user_35CHlksJp30UR5okOLTnBu3yAeM (grzegorz.wolfinger@gmail.com, socket: OAW1CsHh75cIZsrSAAAD) from room room_lecture_1763405529118 by user_358mBnP6UEoMVGz81Q3GoGEzda0
Participant user_35CHlksJp30UR5okOLTnBu3yAeM successfully kicked from room room_lecture_1763405529118
```

**Kicked student receives:**
```typescript
connection.on('kicked_from_room', ({ roomId, reason, kickedBy, timestamp }) => {
  // Show message: "You have been removed from the room: {reason}"
  // Disable chat
  // Close peer connections
  // Disconnect from WebSocket
})
```

**ISSUE:** Backend works correctly. Frontend partially implemented:
- ✅ Shows "You have been removed" message
- ✅ Disables chat
- ✅ Disconnects WebSocket
- ❌ Still shows video feed (should hide completely)
- ❌ Participant list still shows 2 people (should update immediately on kicked event)

**Teacher frontend receives:**
```typescript
connection.on('participant_kicked', ({ userId, reason }) => {
  // Remove user from UI
  // Close peer connection for this user
})
```

---

## Chat Messages

```typescript
// Any participant
connection.sendMessage({ userId, username, content })
- Emits 'send_message' event

// Backend: handleMessage()
1. Check rate limit (5 messages per 10 seconds per user)
2. Generate messageId and sequence number
3. Add timestamp
4. Store in this.messages Map (max 100 messages)
5. Broadcast 'new_message' to ENTIRE ROOM (including sender)
```

**Logs:**
```
(No logs currently - BACKEND ISSUE)
```

**All participants receive:**
```typescript
connection.on('new_message', ({ messageId, userId, username, content, timestamp, sequence }) => {
  // Add message to chat UI
})
```

**BACKEND ISSUE:** Chat works, but no server logs. Should add:
```typescript
console.log(`Chat message from ${username} in room ${roomId}: ${content.substring(0, 50)}...`)
```

---

## Disconnection Flow

### Normal Leave (User Closes Browser)

```typescript
// Browser triggers disconnect
socket.disconnect()

// Backend: handleDisconnect()
1. Find participant in all rooms
2. Remove from this.rooms Map
3. Emit 'user_left' to room
4. Update room activity
```

**Logs:**
```
User wujekbizon@gmail.com disconnected from room room_lecture_1763405529118
```

**Other participants receive:**
```typescript
connection.on('user_left', ({ userId, username, socketId }) => {
  // Remove user from UI
  // Close peer connection for this user
})
```

### Lecture End (Teacher Ends Lecture)

```typescript
// Teacher frontend
await eventSystem.endLecture(lectureId)

// Backend: EventManagementSystem.endLecture()
1. Update lecture status to 'completed' in database
2. Call commsSystem.clearRoom(roomId)

// RealTimeCommunicationSystem.clearRoom()
1. Delete room from this.rooms Map
2. Delete messages from this.messages Map
3. Delete streams from this.streams Map
4. Clear room activity
5. Emit 'room_cleared' to all participants
```

**Logs:**
```
Clearing room room_lecture_1763405529118 - removing all ephemeral data
✓ Room room_lecture_1763405529118 cleared successfully
```

**All participants receive:**
```typescript
connection.on('room_cleared', ({ roomId, reason, timestamp }) => {
  // Show message: "Lecture has ended"
  // Clear chat
  // Close all peer connections
  // Disconnect from WebSocket
})
```

**CURRENT ISSUE:** When lecture ends, room is cleared from WebSocket memory, but database still shows room as 'available'. Users can re-enter the room even though lecture is completed.

---

## Room Lifecycle State Machine

```
┌─────────────┐
│  Lecture    │  Status: 'scheduled'
│  Created    │  Room: Not created yet
└──────┬──────┘
       │ Teacher starts lecture
       ▼
┌─────────────┐
│  Lecture    │  Status: 'active'
│  Active     │  Room: Created in database + WebSocket memory
└──────┬──────┘  Participants: Can join
       │
       │ Teacher ends lecture
       ▼
┌─────────────┐
│  Lecture    │  Status: 'completed'
│  Ended      │  Room: Still in database, cleared from WebSocket
└─────────────┘  Participants: Should NOT be able to rejoin

CURRENT BUG: Room stays 'available' after lecture ends
```

---

## Backend vs Frontend Responsibilities

### Backend Responsibilities

✅ **Working Correctly:**
- WebSocket connection management
- Room joining/leaving
- Participant tracking in memory
- WebRTC signaling (relay offer/answer/ICE)
- Hand raise/lower events
- Mute participant events
- Mute all events
- Kick participant events (including force disconnect)
- Chat message broadcasting
- Message rate limiting
- Automatic room cleanup (30 min inactivity)

❌ **Needs Fixing:**
1. **No chat message logging** - Add console.log for chat messages
2. **Room lifecycle tied to lecture status** - When lecture ends ('completed'), room should become unavailable for re-entry
3. **Room availability validation** - Before allowing `join_room`, check if lecture is 'active'

### Frontend Responsibilities

✅ **Working Correctly:**
- WebSocket connection
- Room joining
- WebRTC peer connection setup
- Chat sending/receiving
- Hand raise/lower UI
- Kick participant button (teacher side)
- Kicked user notification message
- Kicked user chat disable
- Kicked user disconnect

❌ **Needs Fixing:**
1. **Mute participant not implemented** - Listen for `muted_by_teacher` event and disable microphone
2. **Mute all not implemented** - Listen for `mute_all` event and disable microphone
3. **Kicked user still sees video feed** - Hide all video elements when `kicked_from_room` received
4. **Kicked user participant list not updated** - Update participant list immediately on `kicked_from_room`
5. **Room re-entry after lecture ends** - Handle `room_cleared` event properly, prevent re-entry

---

## Data Flow Summary

```
USER ACTION              FRONTEND                 BACKEND                  OTHER USERS
─────────────────────────────────────────────────────────────────────────────────────
Join room             → emit join_room        → Add to Map            → emit user_joined
                                               → emit welcome
                                               → emit room_state

Turn on video         → setupPeerConnection   → relay offer           → receive offer
                      → createOffer           → relay answer          → create answer
                                              → relay ICE             → receive answer

Send message          → emit send_message     → Rate limit check      → emit new_message
                                              → Add to history

Raise hand            → emit raise_hand       → Update participant    → emit hand_raised
                                              → Broadcast to room

Mute participant      → emit mute_participant → Verify permission     → target: muted_by_teacher
(teacher)                                     → Find target socket

Mute all              → emit mute_all         → Verify permission     → all: mute_all
(teacher)                                     → Broadcast to room

Kick participant      → emit kick_participant → Verify permission     → target: kicked_from_room
(teacher)                                     → Remove from Map       → room: participant_kicked
                                              → Force disconnect

End lecture           → call endLecture       → Update DB status      → emit room_cleared
(teacher)                                     → clearRoom()

Leave room            → disconnect            → Remove from Map       → emit user_left
                                              → Update activity
```

---

## Memory Management

### In-Memory Data Structures

```typescript
class RealTimeCommunicationSystem {
  private rooms: Map<string, Map<string, RoomParticipant>>
  // Key: roomId → Key: socketId → Value: participant info

  private streams: Map<string, StreamState>
  // Key: roomId → Value: stream info

  private messages: Map<string, RoomMessage[]>
  // Key: roomId → Value: message history (max 100)

  private roomLastActivity: Map<string, number>
  // Key: roomId → Value: timestamp

  private messageLimiter: Map<string, RateLimitEntry>
  // Key: userId → Value: rate limit info
}
```

### Cleanup Triggers

1. **Automatic (every 5 minutes):**
   - Rooms with no participants + 30 min inactive → deallocateResources()

2. **Manual (lecture ends):**
   - Teacher ends lecture → clearRoom(roomId)

3. **User disconnect:**
   - Browser closes → handleDisconnect() → Remove from room

---

## Testing Checklist

✅ **Backend Working:**
- [x] Teacher creates lecture and joins room
- [x] Student joins room
- [x] WebRTC offer/answer exchange
- [x] Hand raise/lower
- [x] Mute participant (backend emits event)
- [x] Mute all (backend emits event)
- [x] Kick participant (backend removes and disconnects)
- [x] Chat messages sent/received
- [x] Teacher exits room
- [x] Teacher ends lecture (room cleared)

❌ **Backend Needs Fixing:**
- [ ] Chat message logging
- [ ] Room availability validation (check lecture status before join)
- [ ] Prevent room re-entry after lecture ends

❌ **Frontend Needs Fixing:**
- [ ] Implement mute participant UI response
- [ ] Implement mute all UI response
- [ ] Hide video feed for kicked users
- [ ] Update participant list for kicked users
- [ ] Handle room_cleared event (prevent re-entry)

---

## Quick Reference: Event List

### Client → Server

```typescript
join_room              { roomId, user }
leave_room             roomId
send_message           { roomId, message }
request_message_history roomId
start_stream           { roomId, username, quality }
stop_stream            roomId
webrtc:offer           { roomId, targetPeerId, offer }
webrtc:answer          { targetPeerId, answer }
webrtc:ice-candidate   { targetPeerId, candidate }
mute_all_participants  { roomId, requesterId }
mute_participant       { roomId, targetUserId, requesterId }
kick_participant       { roomId, targetUserId, requesterId, reason }
raise_hand             { roomId, userId }
lower_hand             { roomId, userId }
recording_started      { roomId, teacherId }
recording_stopped      { roomId, teacherId, duration }
```

### Server → Client

```typescript
connect                -
disconnect             reason
welcome                { message, timestamp }
room_state             { stream, participants }
message_history        { messages }
new_message            message
user_joined            participant
user_left              participant
stream_started         streamState
stream_stopped         -
webrtc:offer           { fromPeerId, offer }
webrtc:answer          { fromPeerId, answer }
webrtc:ice-candidate   { fromPeerId, candidate }
mute_all               { requestedBy, timestamp }
muted_by_teacher       { requestedBy, reason, timestamp }
kicked_from_room       { roomId, reason, kickedBy, timestamp }
participant_kicked     { userId, reason }
hand_raised            { userId, username, timestamp }
hand_lowered           { userId, timestamp }
room_cleared           { roomId, reason, timestamp }
room_closed            { roomId, reason, timestamp }
server_shutdown        { message, timestamp }
lecture_recording_started  { teacherId, timestamp }
lecture_recording_stopped  { teacherId, duration, timestamp }
error                  { message }
```

---

## Configuration

### Environment Variables

```bash
# WebSocket Server
PORT=3001                                    # WebSocket server port
CORS_ORIGINS=http://localhost:3000,http://localhost:3001  # Allowed origins

# Database
DATABASE_PATH=./data/teaching-playground.json  # JSON database file

# WebRTC
STUN_SERVERS=stun:stun.l.google.com:19302    # STUN server for NAT traversal
```

### Timeouts & Limits

```typescript
INACTIVE_THRESHOLD = 30 * 60 * 1000  // 30 minutes
CLEANUP_INTERVAL = 5 * 60 * 1000     // 5 minutes
MESSAGE_HISTORY_LIMIT = 100          // Max messages per room
RATE_LIMIT_MESSAGES = 5              // Max messages per window
RATE_LIMIT_WINDOW = 10000            // 10 seconds
```

---

## Debugging Tips

### Check Room State

```typescript
// Backend
const participants = commsSystem.getRoomParticipants(roomId)
console.log('Active participants:', participants)
```

### Check Participant Permissions

```typescript
// All participants have these fields:
{
  canStream: boolean       // Can start video (teachers only)
  canChat: boolean         // Can send messages (all users)
  canScreenShare: boolean  // Can share screen (teachers only)
  handRaised: boolean      // Hand raise state
}
```

### Monitor WebRTC Connection State

```typescript
// Frontend
peerConnection.onconnectionstatechange = () => {
  console.log('Connection state:', peerConnection.connectionState)
  // States: new, connecting, connected, disconnected, failed, closed
}
```

---

## Performance Considerations

1. **WebRTC scales to ~6 participants** (mesh topology)
   - Each participant maintains N-1 peer connections
   - 6 participants = 5 connections each = 30 total connections
   - Beyond 6: Consider SFU (Selective Forwarding Unit)

2. **Message history limited to 100** per room
   - Prevents memory bloat
   - Older messages automatically removed

3. **Rate limiting** prevents chat spam
   - 5 messages per 10 seconds per user
   - Prevents server overload

4. **Automatic cleanup** prevents zombie rooms
   - 30 min inactivity → room deleted
   - Runs every 5 minutes

---

## Common Issues & Solutions

### Issue: "Stream ID: null"
**Cause:** `startStream` was receiving userId instead of username
**Fixed in:** v1.1.2
**Solution:** Server now uses username for display

### Issue: "Kicked user still sees video"
**Cause:** Frontend not handling `kicked_from_room` properly
**Status:** Frontend bug
**Solution:** Hide all video elements on kick event

### Issue: "Mute buttons don't work"
**Cause:** Frontend not listening for `mute_all` or `muted_by_teacher` events
**Status:** Frontend bug
**Solution:** Implement event handlers to disable audio tracks

### Issue: "Can re-enter room after lecture ends"
**Cause:** Room cleared from WebSocket but not validated against lecture status
**Status:** Backend bug
**Solution:** Add lecture status check in `handleJoinRoom()`

---

**Last Updated:** 2025-11-17
**Package Version:** 1.4.5
**Tested With:** Production logs from wolfmed application
