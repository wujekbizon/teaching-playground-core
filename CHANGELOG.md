# Changelog

All notable changes to the Teaching Playground Core package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
