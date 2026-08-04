# Migration to v2.4 reservation scheduling

Version 2.4 adds the organization-scoped reservation model while retaining the
legacy `date`-based lecture methods for compatibility.

## Host identity

Set `organizationId` on the trusted `User` passed to `setCurrentUser`. The new
`createRoom`, `listRooms`, and reservation methods reject identities without an
organization. Do not take this value from an untrusted request payload.

## Rooms

Existing rooms may omit `organizationId` and continue to work through legacy
APIs. Before using reservation APIs, backfill every durable room with its owning
organization. New organization-aware room creation derives ownership from the
current user.

`Room.currentLecture` remains supported for legacy live-lecture state, but new
future reservations neither read nor write it. Hosts should stop treating that
field as a calendar.

## Lectures

Existing lecture records remain readable. To make one available through the
new reservation queries, backfill:

- `organizationId`
- `startsAt` and `endsAt` as ISO-8601 instants
- `timezone` as an IANA timezone name
- `capacity`

The legacy `date` field is populated from `startsAt` on new reservations so
older read-only consumers can still display a date. Reservation intervals use
`[startsAt, endsAt)`, allowing adjacent events where one starts exactly when
another ends.

## Persistence and concurrency

The bundled single-process scheduling service serializes conflict checks and
mutations. A host must route scheduling writes for a persistence adapter through
one `EventManagementSystem` instance until a transactional production adapter
is introduced in Phase 2D.4. Do not perform direct concurrent inserts into the
events collection, because they bypass reservation validation.
