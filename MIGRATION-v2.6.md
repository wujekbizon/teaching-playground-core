# Migration to v2.6 scheduler admission

The reservation scheduler starts automatically when `TeachingPlayground` is
initialized and stops during shutdown. Configure it through `eventConfig`:

```ts
new TeachingPlayground({
  eventConfig: {
    earlyAdmissionMs: 10 * 60_000,
    completionGraceMs: 5 * 60_000,
    schedulerIntervalMs: 15_000,
    roomTurnoverMs: 15 * 60_000,
  },
})
```

Defaults are shown above. Existing date-only lectures are ignored by the worker.
Reservation-backed lectures are rebuilt from persistence on the first worker
run after startup.

For reservation-backed rooms, clients must provide the reservation ID through
`RoomConnectionOptions.reservationId`. The trusted authenticated user must also
have the reservation's `organizationId`. Legacy rooms without a scheduler claim
retain the prior direct-room behavior.

Capacity counts active Socket.IO participants in the claimed room. A client
beyond the reservation capacity receives `ROOM_CAPACITY_EXCEEDED`. Before early
admission it receives `ROOM_UNAVAILABLE`; a mismatched tenant receives
`ORGANIZATION_MISMATCH`.

The default room turnover is 15 minutes. A lecture ending at 11:00 permits the
next lecture to start at 11:15 or later; a lecture before it must end by 09:45
when the existing lecture starts at 10:00. Set `roomTurnoverMs` to another
non-negative value if the host has a different cohort-change policy. When a
lecture completes, connected participants receive `room_cleared` and the server
disconnects their sockets so they cannot remain subscribed to the next cohort.
