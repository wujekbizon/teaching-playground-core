# Production Classroom and Scheduling Plan

**Plan version:** 1.0  
**Package baseline:** 2.2.2  
**Last updated:** 2026-08-04  
**Status:** Approved direction; implementation work remains

## 1. Product outcome

Teaching Playground must support multiple schools scheduling and running
independent lectures. A school can own several reusable rooms, reserve them for
subjects at defined times, and run more than one lecture concurrently when
different rooms are available.

The initial production target is normally one or two simultaneous lectures,
while preserving a path to more rooms and multiple backend instances. Redis is
not required merely to create multiple rooms. It becomes relevant when two or
more backend processes must share live classroom state.

## 2. Concepts and ownership

The implementation must keep these concepts separate:

| Concept | Responsibility | Durable? | Preferred store |
|---|---|---:|---|
| Organization | School/client boundary and authorization | Yes | Production database |
| Room | Reusable classroom resource, capacity, features, maintenance status | Yes | Production database |
| Reservation | Subject/lecture occupying a room during a time interval | Yes | Production database |
| Live session | Runtime instance attached to an active reservation | Partly | Database + live state |
| Presence | Connected users, raised hands, stream state, socket ownership | No | One process initially; Redis when horizontally scaled |
| Media | WebRTC tracks and relay paths | No | Browser, TURN, and eventually an SFU if required |

PostgreSQL or another transactional host database should be the source of truth
for organizations, rooms, reservations, and audit history. Redis must not be the
authoritative calendar.

## 3. Current baseline and known gaps

### Already available

- Multiple runtime Socket.IO rooms keyed by `roomId`.
- Persistent room records with capacity, features, and basic status.
- Lecture records associated with a room and a basic lifecycle.
- Filtering lectures by room, teacher, and status.
- Browser tests for classroom interaction and media lifecycle.
- A 141-participant mixed browser/simulator capacity scenario.
- Host injection points for persistence and Socket.IO adapters.

### Not yet production-complete

- No organization/school ownership on rooms, lectures, or queries.
- No required end time for reservations.
- No atomic overlap detection or room availability search.
- A room stores one `currentLecture`; this is not a future reservation calendar.
- No automatic scheduler worker for admission, start, end, and recovery.
- Capacity metadata is not enforced during WebSocket admission.
- Lecture/admission state is process-local and is not rebuilt after restart.
- No production database adapter is shipped or integration-tested.
- TURN configuration is host-provided but relay-only operation is not tested.
- A Socket.IO adapter can be injected, but cross-instance classroom state is
  not yet consistent or failover-tested.
- The classroom harness has a live-room diagnostic screen but no room catalog
  or scheduling interface.

## 4. Target domain model

### Organization

```typescript
interface Organization {
  id: string
  name: string
  timezone: string
  status: 'active' | 'suspended'
  createdAt: string
  updatedAt: string
}
```

Every durable query and mutation must be scoped by `organizationId`. The host
identity provider remains responsible for mapping a trusted user to an
organization and role.

### Room

```typescript
interface Room {
  id: string
  organizationId: string
  name: string
  capacity: number
  status: 'available' | 'maintenance' | 'disabled'
  features: RoomFeatures
  createdAt: string
  updatedAt: string
}
```

`occupied` and `scheduled` are derived views based on reservations and live
sessions, rather than the authoritative permanent status of a room.

### Lecture reservation

```typescript
interface LectureReservation {
  id: string
  organizationId: string
  roomId: string
  subjectId?: string
  name: string
  description?: string
  teacherId: string
  startsAt: string
  endsAt: string
  timezone: string
  capacity: number
  status: 'scheduled' | 'open' | 'in-progress' | 'completed' | 'cancelled'
  createdBy: string
  createdAt: string
  updatedAt: string
}
```

Intervals use `[startsAt, endsAt)`: an event ending at 11:00 does not conflict
with another beginning at 11:00. Active reservations for one room conflict when
`candidate.startsAt < existing.endsAt` and
`candidate.endsAt > existing.startsAt`. Conflict detection and insertion must
occur in one database transaction.

## 5. Required public capabilities

The exact API names can change during implementation, but the package must
provide equivalent typed operations:

```typescript
listRooms({ organizationId, status?, availableFrom?, availableTo? })
createRoom({ organizationId, name, capacity, features })
updateRoom(roomId, updates)
setRoomMaintenance(roomId, enabled)

listReservations({ organizationId, roomId?, teacherId?, from?, to?, status? })
getRoomAvailability({ organizationId, startsAt, endsAt, capacity?, features? })
scheduleLecture({ organizationId, roomId, startsAt, endsAt, ...details })
rescheduleLecture(lectureId, { roomId?, startsAt, endsAt })
cancelLecture(lectureId, reason?)
openLecture(lectureId)
startLecture(lectureId)
completeLecture(lectureId)
```

Required error contracts include `ROOM_NOT_FOUND`, `ROOM_UNAVAILABLE`,
`ROOM_CAPACITY_EXCEEDED`, `RESERVATION_CONFLICT`, `INVALID_TIME_RANGE`,
`ORGANIZATION_MISMATCH`, and `FORBIDDEN`.

## 6. Frontend harness expansion

The harness remains a diagnostic reference application, not the final school
portal. It must nevertheless expose every public room and scheduling capability
so browser tests can validate the package as a consumer would.

### A. Navigation and application states

Add three top-level views:

1. **Rooms** — room catalog and management.
2. **Schedule** — reservation calendar/list and lifecycle controls.
3. **Live classroom** — the existing media/chat/moderation harness.

The selected organization, authenticated development identity, timezone, API
errors, loading state, and empty state must be visible and deterministic.

### B. Rooms view

The Rooms view must support:

- List and refresh all rooms for the selected organization.
- Filter by availability, maintenance state, capacity, and media features.
- Show name, capacity, permanent status, derived current status, next event,
  active participant count, and supported features.
- Create and edit a room.
- Place a room into or out of maintenance.
- Open a room detail panel with upcoming reservations.
- Select an available room while creating or rescheduling a lecture.
- Prevent cross-organization room access in both UI and server behavior.

### C. Schedule view

The Schedule view must support:

- Calendar and list representations with day/week range selection.
- Organization timezone display and explicit UTC payloads.
- Filters for room, teacher, subject, status, and date range.
- Create a lecture with subject/name, teacher, room, start, end, timezone,
  capacity, and description.
- Search available rooms for the chosen interval and requirements.
- Display a useful conflict response with the conflicting reservation.
- Edit, reschedule, and cancel future lectures.
- Open, start, complete, and inspect eligible lectures.
- Join the live classroom only when admission rules permit it.
- Display the schedule correctly after refresh and backend restart.

### D. Live classroom integration

The existing setup form must accept a reservation or live-session identity,
rather than treating an arbitrary room string as the only source of truth. The
view must show the organization, room, lecture, scheduled interval, and current
lifecycle state. Direct room-ID entry may remain behind a diagnostic toggle.

### E. Harness browser coverage

Playwright must cover:

- Room list loading, filtering, creation, editing, and maintenance.
- Empty, loading, validation, authorization, and server-error states.
- Scheduling into an available room.
- Rejection of overlapping reservations.
- Adjacent non-overlapping reservations.
- Rescheduling and cancellation.
- Timezone and daylight-saving boundaries.
- Two simultaneous lectures in different rooms with isolated participants,
  chat, hand raises, moderation, streams, and cleanup.
- Scheduler admission before, during, and after the allowed interval.
- Page refresh and backend restart recovery.
- Organization isolation.

## 7. Delivery sequence

Each item below should be a focused pull request with its own version bump,
dated changelog entry, migration notes when needed, and automated validation.

### Phase 2D.0 — Multi-room isolation baseline

**Purpose:** Prove the existing single backend can host independent concurrent
subjects before changing the scheduler.

- Run at least three rooms concurrently with distinct teachers and students.
- Verify participant, chat, hand, moderation, stream, recording, and cleanup
  isolation.
- Report per-room and aggregate latency/resource metrics.

**Exit criteria:** No cross-room event or state leakage and all rooms remain
interactive under the selected aggregate load.

### Phase 2D.1 — Reservation model and conflict safety

- Add organization ownership and trusted authorization context.
- Introduce `startsAt`, `endsAt`, timezone, and reservation capacity.
- Remove future-calendar dependence on `Room.currentLecture`.
- Add availability queries and atomic overlap rejection.
- Add create, update, reschedule, cancel, and range-query unit/integration tests.
- Define a backwards-compatible migration path for existing lecture records.

**Exit criteria:** Multiple future lectures can reserve one room without
overlap, and separate rooms can be reserved concurrently.

### Phase 2D.2 — Rooms and scheduling harness UI

- Build the Rooms, Schedule, and updated Live classroom views described above.
- Use only exported package APIs; do not import internal implementation files.
- Add accessible forms, keyboard navigation, responsive layouts, and explicit
  error/empty/loading states.
- Add Playwright coverage for the complete room and reservation workflow.

**Exit criteria:** A developer can create rooms, schedule and reschedule
lectures, see conflicts, control lifecycle, and enter an eligible live session
entirely through the harness.

### Phase 2D.3 — Scheduler lifecycle and admission

- Implement an idempotent scheduler/worker for `scheduled → open → in-progress
  → completed` transitions.
- Define configurable early-admission and grace periods.
- Enforce room and reservation capacity during admission.
- Rebuild active lifecycle/admission state from persistence after restart.
- Ensure only the correct reservation can claim a room at a given time.

**Exit criteria:** Clock-driven transitions, restarts, duplicate worker runs,
and late/early clients behave deterministically.

### Phase 2D.4 — Production persistence

- Extend or version the `PersistenceAdapter` contract to support transactions
  required by conflict-safe scheduling.
- Implement and integration-test the host application's production adapter.
- Add database constraints/indexes for organization, room, interval, teacher,
  and status queries.
- Add migrations, backups, retention, and audit expectations.

**Exit criteria:** Scheduling correctness is proven against the intended
production database, not only the JSON development store.

### Phase 2D.5 — TURN relay validation

- Expose safe host-provided TURN configuration to the harness.
- Use short-lived credentials where the selected TURN service supports them.
- Run teacher/student media with `iceTransportPolicy: 'relay'`.
- Assert selected ICE candidate pairs are relayed.
- Cover invalid credentials, unavailable relay, reconnect, and bandwidth
  measurement.

**Exit criteria:** Media works through a real relay-only path and failures are
visible and recoverable.

### Phase 2D.6 — Redis and horizontal scaling

This phase is required only when deploying multiple backend instances; it is
not a prerequisite for multiple rooms on one instance.

- Start two backend instances behind a test load balancer.
- Add the Socket.IO Redis adapter and shared presence/live-state strategy.
- Connect one room's teacher and students through different instances.
- Validate participants, chat history, signaling, moderation, stream state,
  disconnect cleanup, and rate limiting across instances.
- Test rolling restart, instance loss, stale presence expiry, and recovery.
- Document sticky-session and WebSocket transport requirements.

**Exit criteria:** A classroom behaves identically regardless of which backend
accepts each connection, and one backend can restart without corrupting the
remaining room state.

### Phase 2D.7 — Operational readiness

- Add liveness and dependency-aware readiness endpoints.
- Report database/Redis/TURN reachability, event-loop delay, memory pressure,
  connection count, active room count, version, and last scheduler heartbeat.
- Add structured logs, metrics, alerts, load/soak runs, and recovery runbooks.
- Establish service-level objectives only after production-like measurements.

**Exit criteria:** Operators can detect, diagnose, and recover from dependency
and capacity failures without relying on a hard-coded healthy response.

## 8. Release and compatibility rules

- Every pull request updates `CHANGELOG.md` and the package version.
- Schema or public API breaks require migration documentation and a major
  version unless a compatibility layer is retained.
- New backwards-compatible capabilities use a minor version; fixes and plan or
  documentation corrections use a patch version.
- No phase is marked complete until its automated exit criteria pass.
- Local load numbers are regression baselines, not production guarantees.

## 9. Explicitly deferred product features

Breakout rooms, polling, reactions, focus mode, attendance, captions, and cloud
recording remain separate roadmap items. They should not interrupt the room,
reservation, persistence, TURN, and scaling foundation unless stakeholder
priority changes.

## 10. Immediate next pull request

Begin with **Phase 2D.0**: add the three-room concurrent isolation scenario and
fix any state leakage it uncovers. Phase 2D.1 should follow immediately so the
harness scheduling UI is built against the correct reservation model rather
than the current single-`currentLecture` approximation.
