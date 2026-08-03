# Teaching Playground Core — Full Repository Map

> Purpose of this document: a complete, self-contained map of `teaching-playground-core` (v2.1.1) — what it is, how it's built, and how every piece fits together — written to support integrating this service into **wolfmed-edu**. This repo is *already* the backend that wolfmed uses/tested against (see CHANGELOG v1.4.6: "Validated with production logs from wolfmed application").

---

## 1. What This Repo Is

**`@teaching-playground/core`** is a standalone, published npm package that implements the **entire backend + client SDK for a real-time virtual classroom**: WebSocket signaling server, WebRTC video/audio, text chat, lecture/room lifecycle management, participant controls, and client-side recording.

It is designed to be **installed as a dependency** into a host application (like wolfmed-edu) rather than run standalone — though it *can* run standalone via `src/server.ts`.

- **Package name:** `@teaching-playground/core`
- **Version:** 2.1.1
- **License:** MIT (author: WESA)
- **Repo:** `github.com/wujekbizon/teaching-playground-core`
- **Module type:** ESM (`"type": "module"`), compiled TypeScript → `dist/`
- **Entry points:** `main: dist/index.js`, `types: dist/index.d.ts`

### Use cases (per README)
Education, medical training (OSCEs, clinical case discussions, grand rounds), corporate training/webinars, tutoring — i.e. any live-video + chat + scheduling scenario. The roadmap doc explicitly targets **medical education** as the next focus (breakout rooms for clinical case discussion, OSCE station automation, standardized-patient waiting rooms) — directly relevant to wolfmed.

---

## 2. Technology Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.8 (strict mode), compiled to ES2020/ESNext modules |
| Realtime transport | **Socket.IO** 4.8 (server: `socket.io`, client: `socket.io-client`) |
| Video/audio | **WebRTC** (native browser `RTCPeerConnection` API) — signaling relayed over Socket.IO; STUN-only (Google STUN servers), no bundled TURN |
| P2P implementation | Native `RTCPeerConnection` logic in `RoomConnection`; no third-party P2P helper dependency |
| Validation | **Zod** 3.24 (`CreateLectureSchema`, `UpdateLectureSchema`) |
| Persistence (dev/default) | Custom **JsonDatabase** — flat-file JSON store (`data/test-data.json`) with singleton pattern + `async-mutex` for atomic read/modify/write; falls back to REST (`/api/rooms`) + `localStorage` when running in a browser context |
| Concurrency control | `async-mutex` (`Mutex`) around DB reads/writes |
| Event system | Node's `EventEmitter` (both server-side `RealTimeCommunicationSystem` and client-side `RoomConnection`/`WebRTCService` extend it) |
| RPC scaffolding (declared, not wired up) | `@trpc/client` / `@trpc/server` — present as dependencies but no visible tRPC router/usage in `src/` |
| IDs | `uuid` (dev dependency, plus manual `Date.now()`-based IDs like `room_${Date.now()}`, `lecture_${Date.now()}`) |
| Testing | **Jest** 29 + `ts-jest`, `jest-environment-node`, `@jest/globals` |
| Lint | ESLint 9 + `@typescript-eslint` |
| Dev runner | `tsx` (`tsx src/server.ts`, `tsx watch`) |
| Package manager | **pnpm** (lockfile present) |
| Path aliases | `@/*` → `src/*` (tsconfig) |

### Scripts (`package.json`)
```
dev             tsc --watch
build           tsc
server          tsx src/server.ts            # run standalone WS server
server:dev      tsx watch src/server.ts
test            jest
lint            eslint src --ext .ts
test:package    ./scripts/test-package.sh    # full pack/publish smoke test
test:integration ./scripts/test-in-project.sh # installs tarball into a scratch project
pack:inspect    npm pack --dry-run
```

---

## 3. Directory Structure

```
teaching-playground-core/
├── src/
│   ├── index.ts                        # public package entry — re-exports everything below
│   ├── server.ts                       # standalone bootable WS server (startWebSocketServer)
│   ├── engine/
│   │   └── TeachingPlayground.ts       # top-level orchestrator class (facade over the 4 systems)
│   ├── systems/
│   │   ├── room/RoomManagementSystem.ts
│   │   ├── event/EventManagementSystem.ts       # "Lecture" CRUD + status machine
│   │   ├── comms/RealTimeCommunicationSystem.ts # Socket.IO server: rooms, chat, WebRTC signaling, controls
│   │   └── data/DataManagementSystem.ts         # thin stub (mostly console.log placeholders)
│   ├── services/
│   │   ├── RoomConnection.ts           # CLIENT-side Socket.IO wrapper (browser/consumer app uses this)
│   │   └── WebRTCService.ts            # CLIENT-side low-level RTCPeerConnection manager
│   ├── utils/
│   │   └── JsonDatabase.ts             # singleton flat-file DB (server) / REST+localStorage (browser)
│   ├── interfaces/                     # all TypeScript types + Zod schemas
│   │   ├── index.ts                    # barrel export
│   │   ├── room.interface.ts
│   │   ├── event.interface.ts          # `Lecture` type lives here
│   │   ├── user.interface.ts           # `User`, `TeacherProfile`
│   │   ├── comms.interface.ts
│   │   ├── data.interface.ts
│   │   ├── errors.interface.ts         # `SystemError`, `ErrorCode`
│   │   ├── schema.ts                   # Zod schemas for lecture create/update
│   │   └── teaching-playground.interface.ts # top-level config shape
│   ├── __tests__/                      # current, active Jest test suite (13 files)
│   └── __tests_backup/                 # older/retired tests, excluded from `tsc` build
├── scripts/
│   ├── test-package.sh                 # build → pack → install into temp dir → smoke test
│   └── test-in-project.sh              # integration test against a scratch consumer project
├── examples/
│   └── classroom-harness/              # React/Vite browser harness for real media + event testing
├── .env.example                        # PORT, NEXT_PUBLIC_WS_URL, ALLOWED_ORIGINS, rate-limit/cleanup knobs
├── package.json / pnpm-lock.yaml / tsconfig.json / jest.config.js
└── Docs (see §8 below): README.md, CHANGELOG.md, IMPLEMENTATION-PLAN.md,
    MIGRATION-v1.1.md, MIGRATION-v1.2.md, ROADMAP-NEXT.md, WEBSOCKET-FLOW.md,
    TESTING.md, TESTING-v1.4.6.md, TESTING-ANALYSIS-2025-11-17.md, PUBLISHING.md, QUICK-START.md
```

---

## 4. Architecture

### 4.1 High-level shape

The README's own diagram (verified against code):

```
TeachingPlayground (engine, facade)
        │
        ├── RoomManagementSystem   → persists Rooms to JsonDatabase; owns room CRUD + status
        ├── EventManagementSystem  → persists Lectures to JsonDatabase; owns lecture status machine
        ├── RealTimeCommunicationSystem → Socket.IO server; ALL live/ephemeral state lives here
        └── DataManagementSystem   → placeholder/no-op today (saveData/fetchData/backup are stubs)
```

Key architectural rule enforced throughout the code (and called out repeatedly in comments/README): **persistent vs. ephemeral data are strictly separated.**

- **Persistent (JsonDatabase, `data/test-data.json`)**: `rooms` collection, `events` (Lecture) collection. That's it — as of v1.4.4 the participants array was deliberately removed from the Room schema.
- **Ephemeral (in-memory inside `RealTimeCommunicationSystem`, lost on server restart)**: connected participants (`Map<roomId, Map<socketId, RoomParticipant>>`), chat messages (`Map<roomId, RoomMessage[]>`, capped at 100/room), stream state, hand-raise state, rate-limit counters, room-activity timestamps, and (new in v1.4.6) a `roomId → lectureId` / `lectureId → LectureInfo` lookup used to gate room entry by lecture status.

This means: **participant lists and chat history do NOT survive a server restart**, and a consuming app (wolfmed-edu) must not expect to read participants from the database — only via WebSocket (`room_state`, `user_joined`, `user_left` events) or via `RoomManagementSystem.getRoomParticipants()` / `commsSystem.getRoomParticipants()`, which just proxy the in-memory map.

### 4.2 `TeachingPlayground` engine (`src/engine/TeachingPlayground.ts`)

Facade class that a host app instantiates once. Responsibilities actually implemented:
- `setCurrentUser` / `getCurrentUser` — simple in-memory "current user" context used to authorize subsequent calls.
- `createClassroom(...)` → delegates to `RoomManagementSystem.createRoom`, then wires up comms (`commsSystem.setupForRoom`).
- Lecture lifecycle convenience methods: `scheduleLecture`, `getTeacherLectures`, `updateLecture`, `cancelLecture`, `listLectures`, `getLectureDetails` — all delegate to `EventManagementSystem`/`RealTimeCommunicationSystem`, with role-based authorization checks (`teacher`/`admin` only for scheduling/updating/cancelling) and ownership checks (`lecture.teacherId !== currentUser.id` → `FORBIDDEN`).
- `getSystemStatus()` — returns a static `'healthy'` for all four subsystems (not a real health check).
- `setupCommunication`, `disconnectCommunication`, `saveState`, `loadState`, `restartSystem`, `shutdown`, `initialize` — **these are stubs that only `console.log`**; they exist as an API surface but do nothing real yet. Don't rely on them for actual behavior.

Note a subtlety: `RoomManagementSystem` and `EventManagementSystem` each construct their **own** `RealTimeCommunicationSystem` instance internally by default (`RoomManagementSystem` does `new RealTimeCommunicationSystem()` in its constructor), while `TeachingPlayground` constructs a fourth, separate `RealTimeCommunicationSystem` and manually injects it into `EventManagementSystem` via `setCommsSystem()`. **Only the instance that had `.initialize(server)` called on it actually holds a live Socket.IO server and real participant state** — the others are inert. This is important context for wiring the package correctly in wolfmed-edu (see §7 gotchas).

### 4.3 `RoomManagementSystem` (`src/systems/room/RoomManagementSystem.ts`)

CRUD + lifecycle for `Room` documents in JsonDatabase (`rooms` collection).

- `createRoom` → generates `room_${Date.now()}` id, default features (video/audio/chat on, whiteboard off, screenshare on), inserts into DB, calls `commsSystem.setupForRoom(id)`.
- `assignLectureToRoom`, `startLecture`, `endLecture` — mutate `room.currentLecture` and `room.status` (`'available' | 'occupied' | 'scheduled' | 'maintenance'`); `endLecture` calls `commsSystem.deallocateResources(lectureId)` which clears the room's ephemeral state and disconnects sockets.
- `getRoom`, `listRooms`, `updateRoom`, `getAvailableRooms`, `createTestRoom` — standard DB access.
- `getRoomParticipants` — **not** a DB read; proxies to `commsSystem.getRoomParticipants(roomId)` (in-memory).
- `addParticipant`, `removeParticipant`, `updateParticipantStreamingStatus`, `clearParticipants` — **all explicitly `@deprecated`, throw `SystemError('METHOD_DEPRECATED', ...)`**. Participants must be managed exclusively through WebSocket `join_room`/`leave_room` events, never through this service's methods. This is a hard API contract to respect in wolfmed-edu's integration layer.

### 4.4 `EventManagementSystem` (`src/systems/event/EventManagementSystem.ts`)

CRUD + status-machine for `Lecture` documents (`events` collection, `type: 'lecture'` always).

- `createEvent` — validates with `CreateLectureSchema` (Zod), inserts, and if the target room exists, stamps the room with `currentLecture` + `status: 'scheduled'`.
- `cancelEvent` — sets `status: 'cancelled'`, resets the room to `'available'`, and (if a comms system was injected via `setCommsSystem`) calls `commsSystem.clearRoom(roomId)` to purge ephemeral state.
- `getEvent`, `listEvents` (filter by `type`/`roomId`/`teacherId`/`status`), `updateEvent` (validated via `UpdateLectureSchema.partial()`).
- **`updateEventStatus`** — the core lifecycle state machine:
  ```
  scheduled   → in-progress | cancelled | delayed
  delayed     → in-progress | cancelled
  in-progress → completed | cancelled
  completed   → (terminal)
  cancelled   → (terminal)
  ```
  Illegal transitions throw `SystemError('INVALID_STATUS_TRANSITION', ...)`. On `in-progress` it stamps `startTime` and calls `commsSystem.registerLecture(...)` (the v1.4.6 room-availability gate). On `completed`/`cancelled` it stamps `endTime`, calls `commsSystem.clearRoom(...)`, and `commsSystem.unregisterLecture(...)` to prevent re-entry.

  **This is the method wolfmed-edu must call to drive a lecture from scheduled → live → ended** — it's the single integration point that keeps the DB, the room status, and the WebSocket room-availability gate all in sync.

### 4.5 `RealTimeCommunicationSystem` (`src/systems/comms/RealTimeCommunicationSystem.ts`) — the core

A Socket.IO server wrapper (`extends EventEmitter`) holding *all* ephemeral state:

```ts
rooms: Map<roomId, Map<socketId, RoomParticipant>>
streams: Map<roomId, StreamState>
messages: Map<roomId, RoomMessage[]>            // capped at 100/room
roomLastActivity: Map<roomId, timestamp>
messageLimiter: Map<userId, RateLimitEntry>     // 5 msgs / 10s
messageSequence: Map<roomId, number>
roomLectureMap: Map<roomId, lectureId>          // v1.4.6
lectureLookup: Map<lectureId, LectureInfo>      // v1.4.6
```

**Lifecycle:** `initialize(httpServer)` creates the `SocketIOServer` (CORS from `config.allowedOrigins`, `pingTimeout: 10s`, `pingInterval: 5s`), registers all event handlers, and starts a 5-minute cleanup interval that auto-deallocates rooms inactive >30 min with zero participants.

**Socket event handlers (server-side), grouped:**

| Group | Client → Server events | Server → Client events |
|---|---|---|
| Room | `join_room`, `leave_room` | `welcome`, `room_state`, `user_joined`, `user_left`, `join_room_error` (v1.4.6) |
| Chat | `send_message`, `request_message_history` | `new_message`, `message_history` |
| Streaming | `start_stream`, `stop_stream` | `stream_started`, `stream_stopped` |
| WebRTC signaling | `webrtc:offer`, `webrtc:answer`, `webrtc:ice-candidate` | same event names, relayed peer-to-peer with `fromPeerId` added |
| Participant controls (v1.3.1) | `mute_all_participants`, `mute_participant`, `kick_participant`, `raise_hand`, `lower_hand` | `mute_all`, `muted_by_teacher`, `kicked_from_room`, `participant_kicked`, `hand_raised`, `hand_lowered` |
| Recording notifications (v1.4.0, client records locally and just broadcasts status) | `recording_started`, `recording_stopped` | `lecture_recording_started`, `lecture_recording_stopped` |
| Lifecycle | `disconnect` | `room_closed`, `room_cleared`, `server_shutdown` |

**Notable behaviors:**
- `handleJoinRoom` (v1.4.6) checks `roomLectureMap`/`lectureLookup` first — if the room has a registered lecture that is *not* `active`/`in-progress`, the join is rejected with a `join_room_error` (codes map to human messages for `completed`/`cancelled`/`scheduled`). This is the fix that prevents "can re-enter room after lecture ends," called out as validated against wolfmed's production logs.
- `handleMessage` applies rate limiting per `userId` (5 messages / 10s sliding window) before broadcasting; message IDs are `${roomId}_${Date.now()}_${random}`, with a monotonically increasing `sequence` per room.
- `kickParticipant` emits to the target, notifies the room, removes them from the in-memory map, and **force-disconnects the socket after a 1s delay** as a belt-and-braces fallback if the client doesn't self-disconnect.
- `deallocateResources` / `clearRoom` differ subtly: `deallocateResources` notifies clients (`room_closed`) and disconnects sockets before deleting maps (used on full room teardown); `clearRoom` just wipes the maps and emits `room_cleared` without force-disconnecting sockets (used when a lecture ends but the room entity itself persists for reuse).
- WebRTC signaling is **pure relay** — the server never inspects SDP/ICE payloads, just forwards `webrtc:offer|answer|ice-candidate` from one `socket.id` to another `targetPeerId`.

### 4.6 `RoomConnection` (`src/services/RoomConnection.ts`) — the client SDK

This is what a **frontend** (wolfmed-edu's React/Next.js app) instantiates directly: `new RoomConnection(roomId, user, serverUrl)`, then `.connect()`.

- Wraps `socket.io-client` with auto-reconnect (5 attempts, linear backoff off `reconnectDelay * attemptNumber`).
- Mirrors every server event into its own `EventEmitter` API (`connection.on('user_joined', ...)`, etc.) — see the full event list in README §"Events" (reproduced in code above).
- Owns the browser `RTCPeerConnection` lifecycle and uses the current
  `webrtc:offer`, `webrtc:answer`, and `webrtc:ice-candidate` signaling contract.
  Room membership is established before the SDK reports `connected`, and early
  ICE candidates are queued until the remote description is available.
- Screen sharing: `startScreenShare()`/`stopScreenShare()` use `getDisplayMedia` and swap the outgoing video track via `RTCRtpSender.replaceTrack` across all peer connections; auto-stops on browser-native "Stop sharing."
- Client-side recording (v1.4.0): `startRecording(stream, options)` wraps `MediaRecorder` (auto-picks best supported mimeType from a preference list, default 2.5 Mbps), buffers chunks, and on `stop()` emits a `Blob` via `recording_stopped` for the app to download/upload — **the package does not upload recordings anywhere itself**, that's left to the host app.
- Participant-control convenience methods (`muteAllParticipants`, `muteParticipant`, `kickParticipant`, `raiseHand`, `lowerHand`) do **client-side role checks** (`this.user.role !== 'teacher' && !== 'admin'` → throws `SystemError('PERMISSION_DENIED', ...)`) before emitting — but note the **server also re-checks** these permissions authoritatively, so this is UX-only, not a security boundary.

### 4.7 `WebRTCService` (`src/services/WebRTCService.ts`)

Lower-level, transceiver-based peer connection manager retained for internal
compatibility and focused testing. The public `RoomConnection` SDK no longer
uses its legacy signaling events; new integrations should use `RoomConnection`
and provide ICE/TURN settings with `RoomConnectionOptions.rtcConfiguration`.

### 4.8 `JsonDatabase` (`src/utils/JsonDatabase.ts`)

Singleton (`JsonDatabase.getInstance()`), dual-mode:
- **Server** (`typeof window === 'undefined'`): reads/writes `./data/<filename>.json` (default `test-data.json`) directly via `fs`. Auto-creates `./data` dir and seeds initial data (one `test-room-1`, empty `events`) on first load/error.
- **Browser**: fetches `/api/rooms` for room data and reads/writes participants to `localStorage` — this path assumes the **host app** exposes an `/api/rooms` REST endpoint; the package does not provide one. (Largely vestigial now that participants are WebSocket-only, but the code path still exists.)
- All mutating operations (`insert`, `update`, `delete`) are wrapped in an `async-mutex` `Mutex` to serialize concurrent writes and avoid lost updates on the flat JSON file.
- v1.4.3 added a caching optimization: `data` is only re-loaded from disk if `this.data` is still `null`, giving a claimed 750x speedup on repeated operations within one process lifetime.
- **This is explicitly a dev/MVP persistence layer, not meant for multi-instance/production scale** — a real integration into wolfmed-edu should almost certainly swap this for Postgres/Prisma or whatever wolfmed already uses, keeping the same `RoomManagementSystem`/`EventManagementSystem` call sites. That swap is the single biggest integration decision (see §7).

### 4.9 `DataManagementSystem` (`src/systems/data/DataManagementSystem.ts`)

Entirely a stub: `saveData`, `fetchData`, `deleteEventData`, `backupData`, `restoreData`, `getDataStats` all just `console.log` and return placeholder/`null` values. Not wired to JsonDatabase at all. Treat as unimplemented.

### 4.10 Interfaces & Validation (`src/interfaces/`)

- `User` (`id`, `username`, `role: 'teacher'|'student'|'admin'`, optional `email`/`displayName`, `status: 'online'|'offline'|'away'`, optional `metadata.preferences`); `TeacherProfile extends User` adds `subjects`, `availability`, `rating`, lecture counts (not actually populated anywhere in current code — aspirational type).
- `Room`, `RoomFeatures` (`hasVideo/hasAudio/hasChat/hasWhiteboard/hasScreenShare`), `RoomState`, `RoomParticipant extends User`.
- `Lecture` (event.interface.ts) — the full status enum, `communicationStatus` shape, `metadata`, `startTime`/`endTime`.
- `SystemError extends Error` — every thrown error in the package (`code`, `message`, optional `details`). `ErrorCode` union type in `errors.interface.ts` is **incomplete** relative to actual usage — many string codes used at throw sites (`'FORBIDDEN'`, `'UNAUTHORIZED'`, `'ROOM_NOT_FOUND'`, `'PERMISSION_DENIED'`, `'PARTICIPANT_NOT_FOUND'`, `'ALREADY_RECORDING'`, `'NOT_RECORDING'`, `'NO_STREAM'`, `'RECORDING_FAILED'`, `'INVALID_STATUS_TRANSITION'`, etc.) aren't in the `ErrorCode` type — `SystemError`'s constructor takes `code: string`, so this doesn't break at runtime, just means the type is not authoritative. Don't rely on `ErrorCode` for exhaustive `switch` handling in wolfmed-edu.
- `schema.ts` — Zod: `CreateLectureSchema` (name 3–100 chars, date required, roomId required, description 10–500 chars optional, maxParticipants 1–100 optional), `UpdateLectureSchema = CreateLectureSchema.partial()`.

---

## 5. Data Model Summary

**Persisted (JsonDatabase → `rooms`, `events` collections):**

```ts
Room {
  id, name, capacity,
  status: 'available' | 'occupied' | 'scheduled' | 'maintenance',
  features: { hasVideo, hasAudio, hasChat, hasWhiteboard, hasScreenShare },
  currentLecture?: { id, name, teacherId, status } | null,
  createdAt, updatedAt
}

Lecture {
  id, name, date, roomId, type: 'lecture',
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled' | 'delayed',
  teacherId, createdBy,
  description?, maxParticipants?,
  communicationStatus?, metadata?, startTime?, endTime?, scheduledDuration?
}
```

**Ephemeral (Socket.IO memory only, per `RealTimeCommunicationSystem` instance, lost on restart):**

```ts
RoomParticipant {
  id, username, role, displayName?, email?, status,
  socketId, joinedAt,
  canStream, canChat, canScreenShare, isStreaming,
  handRaised, handRaisedAt?
}
RoomMessage { messageId, userId, username, content, timestamp, sequence }
StreamState { isActive, streamerId, quality: 'low'|'medium'|'high' }
```

---

## 6. Testing

- **Framework:** Jest 29 + ts-jest, `jest.config.js` at repo root.
- **Active suite:** `src/__tests__/` — 13 files covering: lecture lifecycle + room cleanup (`EventManagementSystem.*`), JSON DB caching, hotfix regression tests (v1.4.1–v1.4.2, v1.4.4 userId), participant controls / recording / room lifecycle / WebRTC integration for both `RealTimeCommunicationSystem` (server) and `RoomConnection` (client), plus a `package.test.ts` sanity check.
- **Retired suite:** `src/__tests_backup/` — excluded from `tsc` build via `tsconfig.json` `exclude`; superseded by `__tests__`.
- Per README: 174 total tests, 173 passing (99.4%), 1 known non-critical integration timeout.
- `scripts/test-package.sh` and `scripts/test-in-project.sh` do a full build → `npm pack` → install-into-scratch-project smoke test, i.e. they validate the package the way a **consumer like wolfmed-edu would actually install it.**

---

## 7. Integration Notes for wolfmed-edu (read before wiring this in)

1. **This backend was already tested against wolfmed in production** (per CHANGELOG v1.4.6) — the v1.4.6 room-lifecycle-gating fix exists specifically because of bugs found in that integration (users re-entering ended lectures). Check whether wolfmed-edu already has a partial integration/branch to reconcile with, rather than starting clean.
2. **Own the `RealTimeCommunicationSystem` instance carefully.** As noted in §4.2, several classes construct their own internal instance. Only one instance should ever call `.initialize(httpServer)`. The cleanest integration is likely: construct one `RealTimeCommunicationSystem`, `.initialize()` it against wolfmed's HTTP server (or a dedicated WS port), and pass that same instance everywhere state needs to be shared — which today requires either using `TeachingPlayground`'s wiring as-is, or restructuring these systems to accept an injected comms instance in all constructors (currently only `EventManagementSystem.setCommsSystem()` supports late injection).
3. **Persistence layer (`JsonDatabase`) is dev-grade.** Single flat JSON file, mutex-serialized, singleton — fine for a demo, not for wolfmed's real multi-user production load or multi-instance deployment. Plan to replace it with wolfmed's real DB (swap inside `RoomManagementSystem`/`EventManagementSystem`, keep their public method signatures) before relying on this in production, or accept eventual data loss/corruption risk under concurrent load across restarts.
4. **Ephemeral state is single-process/in-memory.** If wolfmed-edu deploys the WS server across multiple instances/pods, participants/chat/stream state won't be shared between instances unless a Socket.IO adapter (e.g. Redis adapter) is added — not present today. Horizontal scaling is a gap to solve before that becomes a requirement.
5. **`EventManagementSystem.updateEventStatus()` is the linchpin call** for lecture start/end — it's what keeps DB status, room status, and the WebSocket room-availability gate in sync. Any custom lecture-scheduling UI in wolfmed-edu should call through this, not mutate `Lecture.status` directly via `updateEvent`.
6. **Never call the deprecated `RoomManagementSystem` participant methods** (`addParticipant`, `removeParticipant`, `updateParticipantStreamingStatus`, `clearParticipants`) — they throw by design. Participants only flow through WebSocket `join_room`/`leave_room`.
7. **The SDK uses one current WebRTC signaling contract** (`webrtc:offer`,
   `webrtc:answer`, and `webrtc:ice-candidate`). Avoid the historical unprefixed
   event names when integrating a frontend.
8. **Production deployments still need host-provided TURN credentials.** Pass a
   complete `RTCConfiguration` through `RoomConnectionOptions.rtcConfiguration`;
   the package must not embed shared production TURN secrets.
9. **`DataManagementSystem` and several `TeachingPlayground` lifecycle methods (`saveState`, `loadState`, `restartSystem`, `shutdown`, `initialize`) are no-op stubs.** Don't assume calling them does anything beyond logging.
10. **`ErrorCode` type is non-exhaustive** — match on `error.code` (string) defensively in wolfmed-edu's error handling rather than relying on the exported union type.
11. Frontend requirements explicitly called out in CHANGELOG v1.4.6 that wolfmed-edu's app layer must implement: handle `join_room_error` (redirect/show message), implement the mute event handlers, and fix kicked-user video cleanup client-side.
12. Consult `WEBSOCKET-FLOW.md` in this repo for full sequence diagrams of every flow (join, second-user-joins, WebRTC negotiation, disconnect, room lifecycle state machine, event quick-reference tables) — it's written exactly for the kind of "how do I plug my frontend in" question wolfmed-edu will face.

---

## 8. Documentation Index (already in repo — read these directly for depth)

| File | Contents |
|---|---|
| `README.md` | Primary docs: features, architecture diagram, install, quick start code samples, full API reference, deployment (Docker, env vars, prod checklist), roadmap summary |
| `CHANGELOG.md` | Full version history back through 1.0.x; v1.4.6 entry documents the wolfmed production-validation fixes in detail |
| `WEBSOCKET-FLOW.md` | Sequence-diagram-style walkthrough of every socket flow, state machine, event quick-reference, debugging tips, common issues |
| `IMPLEMENTATION-PLAN.md` | Design/implementation plan for participant controls (v1.3.1), recording (v1.4.0), and planned breakout rooms (v1.5.0) — includes code sketches |
| `ROADMAP-NEXT.md` | Forward-looking roadmap, explicitly medical-education-focused (breakout rooms for clinical cases, waiting rooms for standardized patients, OSCE tooling, polling, attendance tracking) |
| `MIGRATION-v1.1.md`, `MIGRATION-v1.2.md` | Breaking-change migration guides for consumers upgrading across those versions (relevant if wolfmed-edu pins an older version today) |
| `TESTING.md`, `TESTING-v1.4.6.md`, `TESTING-ANALYSIS-2025-11-17.md` | Testing strategy, v1.4.6 test additions, and a detailed production-log analysis from the wolfmed integration test |
| `PUBLISHING.md`, `QUICK-START.md` | npm publish workflow and fast reference for package testing/publishing (note: QUICK-START.md's code samples are stale relative to current API — e.g. shows `new TeachingPlayground(8080)` and `playground.createRoom(...)`, which don't match the current constructor/method signatures. Trust README.md over QUICK-START.md where they conflict.) |

---

## 9. Open Gaps / Things Not Yet Implemented (be aware before promising these to stakeholders)

- Breakout rooms (planned v1.5.0, design exists in `IMPLEMENTATION-PLAN.md`/`ROADMAP-NEXT.md`, no code yet).
- Waiting rooms, advanced permissions, polling, reactions, focus mode, attendance tracking, closed captions — all roadmap-only, no implementation.
- TURN server support (env vars documented, not read/used in code).
- Cloud upload of recordings — recordings are handed to the host app as a `Blob`; no upload/storage integration exists.
- Horizontal scaling / multi-instance Socket.IO adapter — not present.
- Real database backend — currently flat-file JSON only.
- `DataManagementSystem` — fully stubbed, no real backup/restore/stats.
- `TeachingPlayground.getSystemStatus()` — always reports `'healthy'`, not a real health check.
