# Changelog

All notable changes to the Teaching Playground Core package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2025-11-08

### 🎬 Teaching Features - Lecture Recording

This release adds client-side lecture recording using the MediaRecorder API, enabling teachers to record and save their lectures.

### Added

#### Client-Side Recording Methods (RoomConnection)
- **`startRecording(stream, options?)`** - Start recording lecture (teacher/admin only)
  - Records provided MediaStream (screen share or camera)
  - Automatic MIME type detection (VP9/VP8/H264)
  - Configurable video bitrate (default: 2.5 Mbps)
  - Collects data chunks every second
  - Emits `recording_started` event
- **`stopRecording()`** - Stop recording and generate blob
  - Stops MediaRecorder
  - Emits `recording_stopped` event with blob, duration, and size
  - Automatic duration calculation
- **`isRecording()`** - Check if currently recording
  - Returns boolean recording state
- **`getRecordingDuration()`** - Get current recording duration in seconds
  - Real-time duration tracking while recording

#### Server-Side Notification Handlers (RealTimeCommunicationSystem)
- **Recording notification events** - Broadcast recording state to all participants
  - `recording_started` → broadcasts `lecture_recording_started`
  - `recording_stopped` → broadcasts `lecture_recording_stopped` with duration
  - Room-scoped notifications (only participants in the room are notified)

#### New Events
**Client → Server:**
```typescript
socket.emit('recording_started', {
  roomId: string
  teacherId: string
})

socket.emit('recording_stopped', {
  roomId: string
  teacherId: string
  duration: number // seconds
})
```

**Server → Client:**
```typescript
connection.on('recording_started', ({ timestamp }) => {
  // Local event - recording started successfully
})

connection.on('recording_stopped', ({ blob, duration, size, mimeType, timestamp }) => {
  // Local event - recording stopped, blob ready for download
})

connection.on('lecture_recording_started', ({ teacherId, timestamp }) => {
  // Notification - teacher started recording (shown to students)
})

connection.on('lecture_recording_stopped', ({ teacherId, duration, timestamp }) => {
  // Notification - teacher stopped recording (shown to students)
})
```

### Testing

**Comprehensive test coverage added (147 tests total, 100% passing):**
- 19 client-side recording tests (RoomConnection.recording.test.ts)
- 9 server-side notification tests (RealTimeCommunicationSystem.recording.test.ts)
- All existing 118 tests continue passing

### Frontend Integration

**Example Usage:**
```typescript
// Start recording
await connection.startRecording(screenShareStream)

// Stop recording
connection.stopRecording()

// Handle recording stopped event
connection.on('recording_stopped', ({ blob, duration }) => {
  // Download the recording
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `lecture-${Date.now()}.webm`
  a.click()
  URL.revokeObjectURL(url)
})
```

### Notes

- **Client-side recording:** Recording happens in the browser, no server processing required
- **Teacher/Admin only:** Only teachers and admins can record lectures
- **Automatic MIME type detection:** Supports WebM (VP9/VP8/H264) and MP4
- **Room notifications:** All participants see recording status
- **Cloud upload ready:** Blob can be uploaded to cloud storage after recording

## [1.3.1] - 2025-11-08

### 🎓 Teaching Features - Participant Controls

This release adds essential classroom management features for teachers and administrators.

### Added

#### Server-Side Methods (RealTimeCommunicationSystem)
- **`muteAllParticipants(roomId, requesterId)`** - Teacher/admin can mute all participants
  - Permission check: Only teachers and admins allowed
  - Emits `mute_all` event to all room participants
- **`muteParticipant(roomId, targetUserId, requesterId)`** - Teacher/admin can mute specific participant
  - Permission check: Only teachers and admins allowed
  - Emits `muted_by_teacher` event to target participant
- **`kickParticipant(roomId, targetUserId, requesterId, reason?)`** - Teacher/admin can remove disruptive participants
  - Permission check: Only teachers and admins allowed
  - Emits `kicked_from_room` event to target and `participant_kicked` to room
  - Automatically removes participant from room
- **`raiseHand(roomId, userId)`** - Students can raise hand to ask questions
  - Updates participant state with `handRaised: true` and timestamp
  - Emits `hand_raised` event to room
- **`lowerHand(roomId, userId)`** - Students can lower hand
  - Updates participant state with `handRaised: false`
  - Emits `hand_lowered` event to room

#### Client-Side Methods (RoomConnection)
- **`connection.muteAllParticipants()`** - Teacher calls to mute all participants
- **`connection.muteParticipant(userId)`** - Teacher calls to mute specific participant
- **`connection.kickParticipant(userId, reason?)`** - Teacher calls to kick participant
- **`connection.raiseHand()`** - Student calls to raise hand
- **`connection.lowerHand()`** - Student calls to lower hand

#### New Events
**Server → Client:**
```typescript
connection.on('mute_all', ({ requestedBy, timestamp }) => {
  // All participants should mute themselves
})

connection.on('muted_by_teacher', ({ requestedBy, reason, timestamp }) => {
  // You were muted by teacher
})

connection.on('kicked_from_room', ({ roomId, reason, kickedBy, timestamp }) => {
  // You were removed from room (automatically disconnects)
})

connection.on('participant_kicked', ({ userId, reason }) => {
  // Another participant was kicked (notification)
})

connection.on('hand_raised', ({ userId, username, timestamp }) => {
  // Participant raised hand
})

connection.on('hand_lowered', ({ userId, timestamp }) => {
  // Participant lowered hand
})
```

### Changed

- **RoomParticipant interface** - Added `handRaised: boolean` and `handRaisedAt?: string` fields
- Participants now initialize with `handRaised: false` when joining rooms

### Testing

**Comprehensive test coverage added (118 tests total, 100% passing):**
- 22 client-side participant control tests (RoomConnection.participantControls.test.ts)
- 23 server-side participant control tests (RealTimeCommunicationSystem.participantControls.test.ts)
- All existing 73 tests continue passing

**Test coverage:**
- Permission checks (teacher/admin only for mute/kick)
- Event emission and broadcasting
- Error handling (room not found, participant not found, permission denied)
- State management (hand raise/lower updates)
- Auto-disconnect on kick

### Frontend Integration

**Example Usage:**
```typescript
// Teacher mutes all students
<button onClick={() => connection.muteAllParticipants()}>
  Mute All
</button>

// Teacher mutes specific student
<button onClick={() => connection.muteParticipant(studentId)}>
  Mute Student
</button>

// Teacher kicks disruptive student
<button onClick={() => connection.kickParticipant(studentId, 'Disruptive behavior')}>
  Remove Student
</button>

// Student raises hand
<button onClick={() => connection.raiseHand()}>
  ✋ Raise Hand
</button>

// Listen for hand raised events
connection.on('hand_raised', ({ userId, username, timestamp }) => {
  // Show hand raise indicator for this user
  showHandRaiseIndicator(userId, username)
})

// Listen for mute events
connection.on('mute_all', () => {
  // Disable microphone
  localStream.getAudioTracks()[0].enabled = false
})
```

### Notes

- **Permission-based:** Only teachers and admins can mute or kick participants
- **Anyone can raise hand:** Students and teachers can both raise/lower hands
- **Auto-disconnect on kick:** Kicked participants are automatically disconnected
- **State tracking:** Hand raise state is maintained in participant object
- **Broadcast events:** All room participants receive notifications of state changes

## [1.2.0] - 2025-11-08

### 🎥 Major Features - WebRTC Media Streaming & Screen Sharing

This release implements the complete WebRTC peer-to-peer media streaming infrastructure, enabling actual video/audio communication between participants.

### Added

#### v1.1.3 - Room Cleanup
- **`RealTimeCommunicationSystem.clearRoom()`** - Clears all ephemeral data for a specific room
  - Removes participants from memory
  - Clears message history
  - Clears active streams
  - Closes WebRTC connections
  - Emits `room_cleared` event to all clients
- **Automatic cleanup on lecture end** - EventManagementSystem now calls `clearRoom()` when lecture status becomes 'completed' or 'cancelled'
- **`room_cleared` event** - New WebSocket event sent to clients when room is cleaned up

#### v1.2.0 - WebRTC Media Streaming
- **`RoomConnection.setupPeerConnection()`** - Setup WebRTC peer connection with another participant
  - Creates RTCPeerConnection with STUN servers
  - Adds local media tracks
  - Handles incoming remote tracks
  - Manages ICE candidates
  - Tracks connection state changes
- **`RoomConnection.createOffer()`** - Create and send WebRTC offer to peer
- **`RoomConnection.handleWebRTCOffer()`** - Handle incoming WebRTC offer and send answer
- **`RoomConnection.handleWebRTCAnswer()`** - Handle incoming WebRTC answer
- **`RoomConnection.handleWebRTCIceCandidate()`** - Handle incoming ICE candidates
- **`RoomConnection.closePeerConnection()`** - Cleanup peer connection
- **`RoomConnection.getRemoteStream()`** - Get remote stream for a specific peer
- **`RoomConnection.getAllRemoteStreams()`** - Get all remote streams
- **Peer connection management** - Maintains Map of RTCPeerConnection objects and remote MediaStreams
- **WebRTC signaling events** - Standardized event format with `fromPeerId`

#### v1.3.0 - Screen Sharing
- **`RoomConnection.startScreenShare()`** - Start screen sharing
  - Replaces camera video with screen capture
  - Automatically switches back when user stops sharing
  - Handles browser "Stop Sharing" button
- **`RoomConnection.stopScreenShare()`** - Stop screen sharing and switch back to camera
- **`RoomConnection.isScreenSharing()`** - Check if currently screen sharing
- **`screen_share_started` event** - Emitted when screen sharing starts
- **`screen_share_stopped` event** - Emitted when screen sharing stops

### Changed

- **WebRTC signaling format** - Updated server to use `fromPeerId` instead of `from` for consistency with API contract
- **EventManagementSystem** - Now accepts commsSystem via `setCommsSystem()` for room cleanup integration

### Frontend Integration

**New Events**:
```typescript
// Room cleanup
connection.on('room_cleared', ({ roomId, reason }) => { /* ... */ })

// WebRTC media
connection.on('remote_stream_added', ({ peerId, stream }) => { /* ... */ })
connection.on('remote_stream_removed', ({ peerId }) => { /* ... */ })

// Screen sharing
connection.on('screen_share_started', () => { /* ... */ })
connection.on('screen_share_stopped', () => { /* ... */ })
```

**Usage Example**:
```typescript
// Get local media
const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })

// When participant joins
connection.on('user_joined', async ({ socketId }) => {
  await connection.setupPeerConnection(socketId, stream)
  await connection.createOffer(socketId)
})

// Display remote streams
connection.on('remote_stream_added', ({ peerId, stream }) => {
  videoElement.srcObject = stream
})

// Screen sharing
await connection.startScreenShare()
```

### Architecture

Follows industry-standard WebRTC pattern:
- **Server**: Relay-only signaling (no media processing)
- **Client**: Peer-to-peer media streams (direct connection between participants)
- **STUN Servers**: Google's public STUN for NAT traversal

### Testing

**Comprehensive test coverage added (73 tests, 100% passing):**
- 25 WebRTC peer connection tests (RoomConnection.webrtc.test.ts)
- 17 WebRTC integration tests (WebRTC.integration.test.ts)
- 11 room cleanup tests (RealTimeCommunicationSystem.clearRoom.test.ts)
- 13 event lifecycle tests (EventManagementSystem.roomCleanup.test.ts)
- 7 package quality tests (package.test.ts)

**Test architecture:**
- Mock factory pattern for Jest compatibility
- Global WebRTC API mocking (RTCPeerConnection, RTCSessionDescription, RTCIceCandidate)
- Socket.IO mock persistence across test runs
- Comprehensive error handling validation

See [TESTING.md](./TESTING.md) for complete test documentation.

### Documentation

- **TESTING.md** - Comprehensive testing guide with test suite details
- **MIGRATION-v1.2.md** - Frontend migration guide from v1.1.x to v1.2.0

### Notes

- WebRTC works well for 4-6 participants (P2P mesh)
- For larger classes (>10 participants), consider SFU (Selective Forwarding Unit) - planned for v2.0
- Screen sharing automatically falls back to camera if user cancels
- All peer connections cleaned up automatically on disconnect
- **Production ready**: All 73 tests passing ensures quality before publishing

## [1.1.2] - 2025-11-08

### 🏗️ BREAKING CHANGES - Industry-Standard Architecture

Following analysis of production issues and best practices from Zoom, Google Meet, and Microsoft Teams, we've adopted an industry-standard architecture where:

- **Database** stores persistent data (lectures, rooms)
- **WebSocket** stores ephemeral data (active participants, streams)

**This is a fundamental architectural change.**

### Changed

- **BREAKING**: Removed `participants` array from `Room` interface (database schema)
- **BREAKING**: Removed `participants` array from `Lecture` interface (database schema)
- **BREAKING**: Participants now ONLY exist in `RealTimeCommunicationSystem` memory (WebSocket)
- **BREAKING**: `RoomManagementSystem.addParticipant()` is now deprecated (throws error with migration message)
- **BREAKING**: `RoomManagementSystem.removeParticipant()` is now deprecated
- **BREAKING**: `RoomManagementSystem.updateParticipantStreamingStatus()` is now deprecated
- **BREAKING**: `RoomManagementSystem.clearParticipants()` is now deprecated

### Added

- `RealTimeCommunicationSystem.getRoomParticipants()` - Query active participants from WebSocket memory
- `RoomManagementSystem.getRoomParticipants()` - Now proxies to WebSocket memory instead of database
- Comprehensive inline documentation explaining the new architecture
- Helpful error messages in deprecated methods guiding users to correct approach

### Fixed

- **CRITICAL**: Fixed `startStream` signature mismatch between client and server
  - Server now expects `{ roomId, username, quality }` (was `{ roomId, userId, quality }`)
  - Client now sends object structure (was 3 separate arguments)
  - `StreamState.streamerId` now uses **username** for display (not UUID)
  - Resolves "Stream ID: null" bug reported in production testing
- `createRoom()` no longer initializes empty `participants` array
- `endLecture()` no longer tries to clear participants from database
- `getRoomState()` now gets participant count from WebSocket memory, not database

### Migration Guide

**Database Migration:**
Existing `participants` arrays in database will be ignored. You can safely:
- Leave them in place (will be ignored)
- Clean them up manually if desired
- No action required - the package handles the migration

**Code Migration:**

**Before (v1.1.1):**
```typescript
// ❌ Don't do this anymore
await roomSystem.addParticipant(roomId, user)
await roomSystem.removeParticipant(roomId, userId)

// Participants in database
const room = await db.findOne('rooms', { id: roomId })
console.log(room.participants) // Was in database
```

**After (v1.1.2):**
```typescript
// ✅ Participants auto-managed via WebSocket events
// When user connects, they're automatically added
connection.connect()  // Triggers join_room event

// Get active participants from memory
const participants = roomSystem.getCommsSystem().getRoomParticipants(roomId)
// OR
const participants = await roomSystem.getRoomParticipants(roomId)

// Database rooms no longer have participants
const room = await db.findOne('rooms', { id: roomId })
console.log(room.participants) // ❌ Property doesn't exist
```

**Frontend Applications:**
- ✅ No changes needed if already using WebSocket `join_room`/`leave_room` events
- ✅ Database-stored participant data will be ignored
- ✅ All participant state is now in WebSocket memory

### Architecture Benefits

Following industry-standard approach provides:
- ✅ **Clarity**: Database = persistent, WebSocket = ephemeral
- ✅ **Performance**: No unnecessary database writes for transient data
- ✅ **Accuracy**: Participants automatically managed by connection state
- ✅ **Simplicity**: One source of truth for active participants
- ✅ **Scalability**: Aligns with how professional platforms work

## [1.1.1] - 2025-11-08

### Fixed

- **CRITICAL**: Fixed `RoomConnection` client API compatibility with v1.1.0 server
  - Updated `joinRoom()` to send `{ roomId, user }` object (was separate arguments)
  - Updated `sendMessage()` to send `{ roomId, message }` structure
  - Updated `room_state` handler to not expect `messages` array
  - Added `message_history` event handler
  - Added `room_closed` and `server_shutdown` event handlers
  - Updated `user_joined`/`user_left` handlers for full participant objects
  - Updated `RoomMessage` interface with `messageId` and `sequence`

### Changed

- `RoomConnection.startStream()` signature preparation for v1.1.2 fix

### Notes

- This version fixes the client-side code to match the v1.1.0 server API changes
- Without this fix, `join_room` and `send_message` events would fail
- **Users on v1.1.0 should upgrade to v1.1.1 immediately**

## [1.1.0] - 2025-11-07

### Added
- **Automatic room cleanup system**
  - Rooms automatically cleaned up after 30 minutes of inactivity
  - Cleanup runs every 5 minutes
  - Room activity tracking for all events
  - `room_closed` event emitted to clients before cleanup

- **Full participant objects**
  - Participants now stored with complete user information
  - Includes id, username, role, displayName, email, status, permissions
  - Added `canStream`, `canChat`, `canScreenShare` permission flags
  - `isStreaming` status tracking

- **Message history separation**
  - New `request_message_history` event for explicit history requests
  - Messages no longer sent in `room_state` event
  - Added unique `messageId` and `sequence` numbers to all messages
  - Prevents message duplication issues

- **Race condition protection**
  - Added `async-mutex` to JsonDatabase
  - All CRUD operations now atomic
  - Prevents lost updates from concurrent writes

- **WebRTC signaling integration**
  - `webrtc:offer` event handler
  - `webrtc:answer` event handler
  - `webrtc:ice-candidate` event handler
  - Proper peer-to-peer connection signaling

- **Rate limiting**
  - Message rate limiting (5 messages per 10 seconds per user)
  - Graceful error messages when limit exceeded
  - Per-user tracking with automatic reset

- **Environment validation**
  - Comprehensive environment variable validation on startup
  - Validates PORT, NEXT_PUBLIC_WS_URL format
  - Created `.env.example` with all configuration options
  - Helpful warnings and error messages

- **Graceful shutdown**
  - `shutdown()` method on RealTimeCommunicationSystem
  - Notifies all clients with `server_shutdown` event
  - Stops cleanup timers
  - Closes all connections properly

### Fixed
- **WebRTC connection cleanup** - Now properly deletes transceivers on connection close
- **Memory leaks** - Room resources properly deallocated
- **Participant state** - No more missing participants from concurrent updates
- **Message duplication** - First message no longer appears twice

### Changed
- **BREAKING**: `join_room` event signature changed to `{ roomId: string, user: User }`
- **BREAKING**: `send_message` event signature changed to `{ roomId: string, message: Message }`
- **BREAKING**: `room_state` event no longer includes `messages` array
- **BREAKING**: Participants in events are now objects instead of socket ID strings
- Room state now includes `participantCount` field

### Dependencies
- Added `async-mutex@0.5.0`

### Migration Guide

Frontend applications need to update WebSocket event handlers:

**Before (v1.0.x):**
```typescript
socket.emit('join_room', roomId, userId)
socket.emit('send_message', roomId, message)
// room_state included messages
socket.on('room_state', ({ participants, messages, stream }) => {
  // participants was array of socket IDs
})
```

**After (v1.1.0):**
```typescript
// Pass full user object
socket.emit('join_room', { roomId, user: { id, username, role, ...} })

// Use new message structure
socket.emit('send_message', { roomId, message: { userId, username, content } })

// Request history separately
socket.emit('request_message_history', roomId)
socket.on('message_history', ({ messages }) => {
  // Handle history
})

// room_state has full participant objects
socket.on('room_state', ({ participants, stream }) => {
  // participants is array of RoomParticipant objects with full info
})

// Handle new cleanup event
socket.on('room_closed', ({ roomId, reason }) => {
  // Clean up UI, redirect user, etc.
})
```

## [1.0.2] - 2025-11-07

### Added
- Comprehensive testing and publishing documentation (TESTING.md, PUBLISHING.md, QUICK-START.md)
- Automated test scripts (test-package.sh, test-in-project.sh)
- Basic package validation tests
- Environment variable validation
- LICENSE file (MIT)
- .npmignore configuration

### Fixed
- Jest configuration to exclude backup tests
- Test setup file requirements

### Changed
- Lowered test coverage thresholds to 50% for MVP stage
- Updated package.json with npm publishing metadata

## [1.0.0] - Initial Release

### Added
- Core TeachingPlayground engine
- RoomManagementSystem for virtual classroom creation
- EventManagementSystem for lecture scheduling
- RealTimeCommunicationSystem for WebSocket connections
- WebRTCService for peer-to-peer video streaming
- JsonDatabase for simple data persistence
- RoomConnection client for connecting to rooms
- Full TypeScript support with type definitions
