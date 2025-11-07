# Migration Guide: v1.0.x → v1.1.0

This guide helps you migrate from Teaching Playground Core v1.0.x to v1.1.0.

## Overview

Version 1.1.0 includes **critical bug fixes** and **breaking API changes** to address production issues identified during Wolfmed integration testing.

### What's Changed?
- ✅ Fixed memory leaks and room cleanup issues
- ✅ Fixed message duplication
- ✅ Fixed race conditions in database
- ✅ Added WebRTC signaling support
- ✅ Added automatic cleanup and rate limiting
- ⚠️ **Breaking changes to WebSocket event signatures**

---

## Breaking Changes

### 1. `join_room` Event Signature

**v1.0.x:**
```typescript
socket.emit('join_room', roomId: string, userId: string)
```

**v1.1.0:**
```typescript
socket.emit('join_room', {
  roomId: string,
  user: User  // Full user object required
})
```

**Migration:**
```typescript
// Before
socket.emit('join_room', 'room-123', 'user-456')

// After
socket.emit('join_room', {
  roomId: 'room-123',
  user: {
    id: 'user-456',
    username: 'john_doe',
    role: 'student',
    displayName: 'John Doe',
    email: 'john@example.com',
    status: 'online'
  }
})
```

### 2. `send_message` Event Signature

**v1.0.x:**
```typescript
socket.emit('send_message', roomId: string, message: Partial<Message>)
```

**v1.1.0:**
```typescript
socket.emit('send_message', {
  roomId: string,
  message: {
    userId: string,
    username: string,
    content: string
  }
})
```

**Migration:**
```typescript
// Before
socket.emit('send_message', 'room-123', {
  userId: 'user-456',
  username: 'john_doe',
  content: 'Hello!'
})

// After
socket.emit('send_message', {
  roomId: 'room-123',
  message: {
    userId: 'user-456',
    username: 'john_doe',
    content: 'Hello!'
  }
})
```

### 3. `room_state` Event Response

**v1.0.x:**
```typescript
socket.on('room_state', (data) => {
  // data = { participants: string[], messages: Message[], stream: StreamState }
  console.log(data.participants) // ['socket-id-1', 'socket-id-2']
  console.log(data.messages)     // All messages
})
```

**v1.1.0:**
```typescript
socket.on('room_state', (data) => {
  // data = { participants: RoomParticipant[], stream: StreamState }
  // NO MESSAGES in room_state anymore!
  console.log(data.participants) // [{ id, username, role, ...}, ...]
})
```

**Migration:**
```typescript
// Before
socket.on('room_state', ({ participants, messages, stream }) => {
  setParticipants(participants) // Just socket IDs
  setMessages(messages)         // All messages
  setStream(stream)
})

// After
socket.on('room_state', ({ participants, stream }) => {
  // Full participant objects with all info!
  setParticipants(participants) // [{ id, username, role, permissions, ... }]
  setStream(stream)

  // Request message history separately if needed
  socket.emit('request_message_history', roomId)
})
```

### 4. Message History Request

**New in v1.1.0:**
```typescript
// Request message history explicitly
socket.emit('request_message_history', roomId: string)

// Listen for history response
socket.on('message_history', ({ messages }) => {
  console.log(messages) // Array of messages with messageId, sequence, etc.
})
```

**Migration:**
```typescript
// Add this after joining room
function joinRoom(roomId, user) {
  socket.emit('join_room', { roomId, user })

  // Wait for room_state
  socket.once('room_state', ({ participants, stream }) => {
    setParticipants(participants)
    setStream(stream)

    // Then request message history
    socket.emit('request_message_history', roomId)
  })
}

socket.on('message_history', ({ messages }) => {
  setMessages(messages)
})
```

### 5. Participant Objects Structure

**v1.0.x:**
```typescript
// Participants were just socket IDs
participants: string[] = ['socket-id-1', 'socket-id-2']
```

**v1.1.0:**
```typescript
// Participants are full objects
participants: RoomParticipant[] = [
  {
    id: 'user-123',
    username: 'john_doe',
    role: 'teacher',
    displayName: 'John Doe',
    email: 'john@example.com',
    status: 'online',
    socketId: 'socket-id-1',
    joinedAt: '2025-11-07T15:00:00.000Z',
    canStream: true,
    canChat: true,
    canScreenShare: true,
    isStreaming: false
  },
  // ...
]
```

**Migration:**
```typescript
// Before - had to fetch user data from DB
const userId = participants[0] // 'socket-id-1'
const userData = await fetchUserFromDB(userId) // Extra DB call!

// After - all data already available
const user = participants[0]
console.log(user.username)    // 'john_doe'
console.log(user.role)        // 'teacher'
console.log(user.canStream)   // true
// No extra DB calls needed!
```

---

## New Features to Adopt

### 1. Room Closed Event

Handle automatic room cleanup notifications:

```typescript
socket.on('room_closed', ({ roomId, reason, timestamp }) => {
  console.log(`Room ${roomId} was closed: ${reason}`)

  // Clean up UI
  setRoomActive(false)

  // Redirect or show notification
  showNotification('Room has been closed due to inactivity')
  router.push('/rooms')
})
```

### 2. Rate Limiting

Handle rate limit errors gracefully:

```typescript
socket.on('error', ({ message }) => {
  if (message.includes('Rate limit exceeded')) {
    showNotification('Please slow down your messages', 'warning')
    disableSendButton(5000) // Disable for 5 seconds
  }
})
```

### 3. Message IDs and Sequence

Messages now have unique IDs:

```typescript
socket.on('new_message', (message) => {
  console.log(message.messageId)  // 'room-123_1699371234567_abc123'
  console.log(message.sequence)   // 42

  // Use messageId for deduplication
  if (!messagesMap.has(message.messageId)) {
    messagesMap.set(message.messageId, message)
    setMessages([...messagesMap.values()])
  }
})
```

### 4. WebRTC Signaling

Now properly integrated:

```typescript
// Offer
socket.on('webrtc:offer', ({ from, offer }) => {
  const pc = peerConnections.get(from)
  await pc.setRemoteDescription(offer)
  const answer = await pc.createAnswer()
  await pc.setLocalDescription(answer)
  socket.emit('webrtc:answer', { targetPeerId: from, answer })
})

// Answer
socket.on('webrtc:answer', ({ from, answer }) => {
  const pc = peerConnections.get(from)
  await pc.setRemoteDescription(answer)
})

// ICE Candidate
socket.on('webrtc:ice-candidate', ({ from, candidate }) => {
  const pc = peerConnections.get(from)
  await pc.addIceCandidate(candidate)
})
```

### 5. Server Shutdown

Handle graceful shutdowns:

```typescript
socket.on('server_shutdown', ({ message, timestamp }) => {
  console.log('Server is shutting down:', message)

  // Save any pending data
  saveDraftMessage()

  // Show notification
  showNotification('Server maintenance in progress. Please reconnect in a moment.', 'info')

  // Auto-reconnect after delay
  setTimeout(() => {
    socket.connect()
  }, 5000)
})
```

---

## Environment Variables

### New .env Configuration

Create a `.env` file based on `.env.example`:

```bash
# Server Configuration
PORT=3001
NODE_ENV=development

# WebSocket Configuration
NEXT_PUBLIC_WS_URL=http://localhost:3000

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

# Optional: Room Configuration
ROOM_CLEANUP_INTERVAL=300000      # 5 minutes
ROOM_INACTIVE_THRESHOLD=1800000   # 30 minutes
MESSAGE_HISTORY_LIMIT=100

# Optional: Rate Limiting
RATE_LIMIT_MESSAGES=5
RATE_LIMIT_WINDOW=10000           # 10 seconds
```

---

## Step-by-Step Migration

### Step 1: Update Package

```bash
# If using npm
npm install @teaching-playground/core@^1.1.0

# If using pnpm
pnpm add @teaching-playground/core@^1.1.0

# If using yarn
yarn add @teaching-playground/core@^1.1.0
```

### Step 2: Update join_room Calls

Find all `join_room` emits and update signature:

```typescript
// Update this
socket.emit('join_room', roomId, userId)

// To this
socket.emit('join_room', {
  roomId,
  user: currentUser // Full user object from your auth system
})
```

### Step 3: Update send_message Calls

```typescript
// Update this
socket.emit('send_message', roomId, message)

// To this
socket.emit('send_message', { roomId, message })
```

### Step 4: Handle room_state Changes

```typescript
// Remove messages from room_state handler
socket.on('room_state', ({ participants, stream }) => { // No messages!
  setParticipants(participants) // Now full objects
  setStream(stream)

  // Request messages separately
  socket.emit('request_message_history', roomId)
})
```

### Step 5: Add message_history Handler

```typescript
socket.on('message_history', ({ messages }) => {
  setMessages(messages)
})
```

### Step 6: Add New Event Handlers

```typescript
// Room cleanup
socket.on('room_closed', ({ roomId, reason }) => {
  handleRoomClosed(roomId, reason)
})

// Server shutdown
socket.on('server_shutdown', ({ message }) => {
  handleServerShutdown(message)
})
```

### Step 7: Update Participant Display

```typescript
// Before - participants were socket IDs
participants.map(socketId => (
  <div key={socketId}>{socketId}</div> // Not useful!
))

// After - participants are full objects
participants.map(participant => (
  <div key={participant.id}>
    <Avatar src={participant.avatar} />
    <span>{participant.displayName || participant.username}</span>
    <RoleBadge role={participant.role} />
    {participant.isStreaming && <LiveIndicator />}
  </div>
))
```

### Step 8: Test Everything

1. ✅ Room joining with full user object
2. ✅ Message sending with new structure
3. ✅ Message history loading
4. ✅ Participant display with full info
5. ✅ WebRTC video streaming
6. ✅ Room cleanup handling
7. ✅ Rate limiting behavior

---

## Common Issues

### Issue: "Cannot read property 'username' of undefined"

**Cause:** Trying to access user properties from socket ID

**Fix:** Update to use full participant objects
```typescript
// Before
const userId = participants[0]
const user = await getUserFromDB(userId) // participants[0] is socket ID

// After
const user = participants[0] // Already a full object!
console.log(user.username)   // Works immediately
```

### Issue: "Messages not loading on join"

**Cause:** room_state no longer includes messages

**Fix:** Request message history explicitly
```typescript
socket.emit('request_message_history', roomId)
socket.on('message_history', ({ messages }) => setMessages(messages))
```

### Issue: "First message appears twice"

**This is fixed in v1.1.0!** If you still see it:
- Update to v1.1.0
- Use message deduplication with messageId:

```typescript
const messagesMap = new Map()

socket.on('new_message', (message) => {
  messagesMap.set(message.messageId, message)
  setMessages([...messagesMap.values()])
})
```

### Issue: "Participants disappear randomly"

**This is fixed in v1.1.0!** JsonDatabase now uses mutex to prevent race conditions.

### Issue: "Room never cleans up after lecture ends"

**This is fixed in v1.1.0!** Rooms now auto-cleanup after 30 minutes of inactivity.

---

## Testing Your Migration

### Test Checklist

- [ ] Can join room with full user object
- [ ] Messages send successfully
- [ ] Message history loads on join
- [ ] Participants display with correct names/roles
- [ ] Video streaming works (WebRTC)
- [ ] Multiple users can join simultaneously
- [ ] Room cleanup notification received
- [ ] Rate limiting triggers after 5 quick messages
- [ ] Graceful handling of server shutdown

### Test Script

```typescript
// test-migration.ts
import { io } from 'socket.io-client'

const socket = io('http://localhost:3001')

const testUser = {
  id: 'test-user-123',
  username: 'test_user',
  role: 'student',
  displayName: 'Test User',
  email: 'test@example.com',
  status: 'online'
}

// Test join
socket.emit('join_room', { roomId: 'test-room', user: testUser })

socket.on('room_state', ({ participants, stream }) => {
  console.log('✅ Room state received')
  console.log('Participants:', participants)

  // Request history
  socket.emit('request_message_history', 'test-room')
})

socket.on('message_history', ({ messages }) => {
  console.log('✅ Message history received:', messages.length, 'messages')
})

// Test message send
setTimeout(() => {
  socket.emit('send_message', {
    roomId: 'test-room',
    message: {
      userId: testUser.id,
      username: testUser.username,
      content: 'Test message from v1.1.0!'
    }
  })
}, 1000)

socket.on('new_message', (message) => {
  console.log('✅ Message received:', message)
  console.log('  - Has messageId:', !!message.messageId)
  console.log('  - Has sequence:', !!message.sequence)
})
```

Run the test:
```bash
npx tsx test-migration.ts
```

---

## Support

If you encounter issues during migration:

1. Check this guide thoroughly
2. Review the [CHANGELOG.md](./CHANGELOG.md)
3. See example code in [README.md](./README.md)
4. Open an issue on GitHub with:
   - Current version you're migrating from
   - Specific error messages
   - Code samples showing the issue

---

## Summary

v1.1.0 is a **major stability and feature release** that fixes critical production issues:

✅ **Memory leaks** - Fixed
✅ **Message duplication** - Fixed
✅ **Race conditions** - Fixed
✅ **WebRTC signaling** - Added
✅ **Automatic cleanup** - Added
✅ **Rate limiting** - Added

The breaking changes are **necessary** to provide a production-ready, stable package. The migration is straightforward and well worth the improvements!
