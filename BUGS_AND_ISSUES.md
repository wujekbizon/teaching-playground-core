# Bugs and Issues Analysis

## Critical Bugs

### 1. WebRTC Signaling Not Integrated with WebSocket Layer
**Location:** `src/systems/comms/RealTimeCommunicationSystem.ts` and `src/services/WebRTCService.ts`

**Issue:** WebRTCService emits events (`iceCandidate`, `remoteStream`, `negotiationNeeded`) but RealTimeCommunicationSystem doesn't have handlers to relay these via WebSocket to other peers.

**Impact:** WebRTC connections cannot be established because signaling (offer/answer/ICE candidates) isn't transmitted between peers.

**Fix Required:**
- Add WebSocket event handlers for: `offer`, `answer`, `ice-candidate`
- Integrate WebRTCService events with Socket.io to relay signaling messages
- Add WebRTC instance to RealTimeCommunicationSystem

### 2. JsonDatabase Race Conditions
**Location:** `src/utils/JsonDatabase.ts`

**Issue:** Multiple concurrent operations can cause race conditions:
- `load()` is called at the start of every operation
- `save()` is called at the end of every operation
- No locking mechanism between load and save
- Singleton pattern doesn't prevent concurrent operations

**Impact:** Data corruption, lost updates, inconsistent state

**Example Scenario:**
```typescript
// Operation 1: Add participant to room A
await db.update('rooms', {id: 'A'}, {participants: [...]}) // loads data
// Operation 2: Add participant to room A (concurrent)
await db.update('rooms', {id: 'A'}, {participants: [...]}) // loads same data
// Operation 1: saves
// Operation 2: saves (overwrites Operation 1's changes)
```

**Fix Required:**
- Implement mutex/lock mechanism
- Use operation queue
- Or consider using a real database (SQLite, PostgreSQL)

### 3. RoomConnection Service Not Integrated
**Location:** `src/services/RoomConnection.ts`

**Issue:** RoomConnection class exists with full client-side connection logic but:
- Never imported or used in the main engine
- No integration with RealTimeCommunicationSystem
- WebRTC events not connected to server signaling

**Impact:** Clients can't use the provided service to connect to rooms

**Fix Required:**
- Export and document RoomConnection in README
- Add example showing how to use it
- Connect RoomConnection events to server-side handlers

### 4. DataManagementSystem is Completely Stubbed
**Location:** `src/systems/data/DataManagementSystem.ts`

**Issue:** All methods only log to console:
- `saveData()` - does nothing
- `fetchData()` - returns undefined
- `deleteEventData()` - does nothing
- `backupData()` / `restoreData()` - not implemented
- `getDataStats()` - returns hardcoded empty values

**Impact:** Data persistence layer doesn't work, despite being called by TeachingPlayground

**Fix Required:**
- Either implement the methods using JsonDatabase
- Or remove the system and document JsonDatabase as the data layer
- Update TeachingPlayground to not call stub methods

---

## High Priority Issues

### 5. No Jest Configuration
**Location:** Missing `jest.config.js`

**Issue:** `pnpm test` fails because Jest has no configuration

**Fix Required:**
```javascript
// jest.config.js
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/*.test.ts', '**/*.spec.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1'
  }
}
```

### 6. Memory Leaks in RealTimeCommunicationSystem
**Location:** `src/systems/comms/RealTimeCommunicationSystem.ts:21-23`

**Issue:** Three Maps never cleaned:
- `rooms: Map<string, Set<string>>` - grows indefinitely
- `streams: Map<string, StreamState>` - only deleted on stop_stream
- `messages: Map<string, RoomMessage[]>` - keeps 100 messages per room forever

**Impact:** Memory usage grows unbounded in long-running servers

**Fix Required:**
- Add TTL (time-to-live) for rooms with no participants
- Implement periodic cleanup of empty rooms
- Add maximum room limit with LRU eviction

### 7. WebRTC Connection Cleanup Issues
**Location:** `src/services/WebRTCService.ts:175-183`

**Issue:**
- `closeConnection()` closes peer connection but doesn't clean up transceivers Map entry (line 181)
- When connection fails/closes, `onconnectionstatechange` handler cleans up (line 96), but not in manual close

**Impact:** Memory leaks, dangling references

**Fix Required:**
```typescript
closeConnection(peerId: string) {
  const pc = this.peerConnections.get(peerId)
  if (pc) {
    pc.close()
    this.peerConnections.delete(peerId)
    this.transceivers.delete(peerId) // Add this line
  }
}
```

### 8. Missing Environment Variable Validation
**Location:** `src/server.ts`

**Issue:** Server assumes PORT and NEXT_PUBLIC_WS_URL exist with defaults but:
- No validation of URL format
- No error handling for invalid port numbers
- No documentation of required environment variables

**Fix Required:**
- Add .env.example file
- Validate environment variables on startup
- Add clear error messages for misconfiguration

---

## Medium Priority Issues

### 9. Unused Dependencies
**Location:** `package.json`

**Issues:**
- `simple-peer` (9.11.1) - imported in types but never used (using native RTCPeerConnection)
- `@trpc/server` & `@trpc/client` (10.45.2) - imported but never used
- `uuid` (11.1.0) - imported but not used (using timestamp-based IDs)

**Impact:** Bloated bundle size, confusing dependencies

**Fix Required:**
- Remove unused dependencies
- Or document why they're kept for future use

### 10. Incomplete Error Code Coverage
**Location:** `src/interfaces/errors.interface.ts`

**Issue:** ErrorCode type defines limited codes but systems use many more:
```typescript
// Defined: 'VALIDATION_ERROR' | 'UNAUTHORIZED' | ...
// Used but not defined: 'LECTURE_SCHEDULING_FAILED', 'LECTURE_LIST_FAILED', etc.
```

**Impact:** Type safety broken, errors can use any string

**Fix Required:**
- Add all used error codes to ErrorCode union type
- Use const enum for better type checking

### 11. Browser Detection is Fragile
**Location:** `src/utils/JsonDatabase.ts:11`

**Issue:** `typeof window === 'undefined'` doesn't work in all environments:
- Fails in Electron (has window but is Node)
- Fails in some SSR frameworks
- Assumes localStorage always exists in browser

**Fix Required:**
```typescript
private isServer = (
  typeof window === 'undefined' ||
  typeof process !== 'undefined' && process.versions?.node
)
```

### 12. No Graceful Shutdown
**Location:** `src/engine/TeachingPlayground.ts:246`

**Issue:** `shutdown()` method only logs, doesn't:
- Close WebSocket connections
- Stop WebRTC peer connections
- Save pending data
- Clean up resources

**Impact:** Unclean shutdowns, data loss, connection hangs

**Fix Required:**
```typescript
shutdown(): void {
  console.log('Shutting down all systems')
  this.commsSystem.closeAllConnections()
  this.roomSystem.clearAllRooms()
  // ... cleanup logic
}
```

---

## Low Priority Issues

### 13. Inconsistent Timestamp Formats
**Issue:** Mix of ISO strings and Date objects throughout codebase

**Examples:**
- RoomMessage.timestamp: string (ISO)
- Room.createdAt: string (ISO)
- Lecture.date: string (user input format)

**Fix Required:** Standardize on ISO 8601 strings everywhere

### 14. No Rate Limiting
**Location:** `src/systems/comms/RealTimeCommunicationSystem.ts`

**Issue:** No protection against:
- Message spam
- Connection spam
- Stream start/stop spam

**Fix Required:** Add rate limiting middleware for Socket.io events

### 15. Missing Input Sanitization
**Issue:** User inputs not sanitized:
- Room names
- Message content
- Lecture descriptions

**Risk:** XSS vulnerabilities if displayed in web UI

**Fix Required:** Add sanitization library (DOMPurify, xss)

### 16. No Logging Infrastructure
**Issue:** Only console.log throughout, no:
- Log levels (debug, info, warn, error)
- Structured logging
- Log aggregation
- Request tracing

**Fix Required:** Integrate proper logger (winston, pino)

### 17. No Health Check Endpoint
**Issue:** No way to monitor server health:
- Is WebSocket server running?
- How many active connections?
- Memory usage?

**Fix Required:** Add `/health` HTTP endpoint

### 18. Hard-coded Test Room in Production
**Location:** `src/engine/TeachingPlayground.ts:24-33`

**Issue:** Test room created based on `NODE_ENV === 'development'` but:
- Can be accidentally enabled in production
- No way to disable without code change

**Fix Required:** Use feature flag or explicit config option

---

## Architecture Concerns

### 19. Circular Dependency Risk
**Location:** `src/systems/room/RoomManagementSystem.ts`

**Issue:** RoomManagementSystem imports RealTimeCommunicationSystem
- Creates tight coupling
- Makes testing difficult
- Risk of circular imports

**Fix Required:** Use dependency injection or event-based communication

### 20. Single Instance Assumptions
**Issue:** Code assumes single server instance:
- JsonDatabase singleton
- In-memory Maps in RealTimeCommunicationSystem
- Room state not shared across servers

**Impact:** Cannot scale horizontally (no cluster support)

**Fix Required:**
- Use Redis for shared state
- Add cluster-aware room management
- Document single-instance limitation

### 21. No API Versioning
**Issue:** WebSocket events and data structures have no version:
- Clients and server must be in sync
- No migration path for breaking changes

**Fix Required:** Add protocol version negotiation

---

## Testing Gaps

### 22. Zero Test Coverage
**Issue:** No tests written for:
- Room management logic
- Event management
- WebSocket event handlers
- WebRTC signaling
- Database operations
- Authorization checks

**Fix Required:** Comprehensive test suite needed (see ROADMAP.md)

### 23. No Integration Tests
**Issue:** No way to test:
- Full lecture creation flow
- WebSocket + WebRTC integration
- Multi-client scenarios

**Fix Required:** Add integration test suite with test clients

### 24. No E2E Tests
**Issue:** No automated testing of:
- Real browser clients
- Actual WebRTC connections
- Socket.io with real network

**Fix Required:** Add Playwright/Puppeteer E2E tests

---

## Documentation Gaps

### 25. No API Documentation
**Issue:** No documentation for:
- WebSocket event payloads
- TeachingPlayground public API
- Error responses
- Example usage

**Fix Required:** Add API documentation (JSDoc, separate docs)

### 26. No Deployment Guide
**Issue:** No instructions for:
- Production deployment
- Environment setup
- Reverse proxy configuration
- SSL/TLS setup for WebRTC

**Fix Required:** Add DEPLOYMENT.md

### 27. No Architecture Diagrams
**Issue:** Complex system with 4 subsystems but no visual documentation

**Fix Required:** Add Mermaid diagrams to README

---

## Summary

**Critical:** 4 bugs (must fix for MVP)
**High Priority:** 4 issues (should fix for MVP)
**Medium Priority:** 8 issues (fix for production)
**Low Priority:** 9 issues (fix for scale)
**Architecture:** 3 concerns (document or refactor)
**Testing:** 3 gaps (comprehensive testing needed)
**Documentation:** 3 gaps (improve documentation)

**Total Issues: 31**
