# Changelog

All notable changes to the Teaching Playground Core package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
