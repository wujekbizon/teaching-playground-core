# Classroom Harness

This private React/Vite example exercises the browser-facing API of
`@teaching-playground/core`. It is a diagnostic tool, not the final product UI.

The harness has three top-level views: **Rooms**, **Schedule**, and **Live
classroom**. With `DEV_AUTH_ENABLED=true`, the development server exposes the
organization-scoped management endpoints consumed by the Rooms and Schedule
views. The reference organization is visibly fixed to `school-demo`; these
development endpoints are unavailable when development authentication is off
and are refused in production mode.

Rooms supports catalog refresh, capacity filtering, creation, and maintenance.
Schedule supports persistent reservation listing, availability search with UTC
payloads, scheduling, rescheduling, conflict feedback, and cancellation.
The development scheduler automatically opens reservations before their start,
marks them in progress at the start, and completes them after the configured
grace period. Eligible reservations expose a **Join live** action that carries
the reservation identity into WebSocket admission.

## Run

```bash
pnpm install
pnpm dev
```

The default server URL is `http://localhost:3001`. Start the core standalone
server from the repository root with
`DEV_AUTH_ENABLED=true pnpm server:dev`. Use unique `role:name` tokens in each
tab, such as `teacher:maya` and `student:alex`.

## First acceptance flow

1. Open two tabs.
2. Join the same room as a teacher and student.
3. Grant camera and microphone permission.
4. Confirm participant state, video negotiation, and chat.
5. Exercise hand raise, mute, screen share, and recording.
6. Kick the student and verify remote media disappears.
7. Inspect the Events tab for any failed or out-of-order events.

The harness sends `RoomConnectionOptions.auth.token`. The default standalone
server runs in compatibility mode; an authenticated host should validate that
token through `CommsConfig.identityProvider` with `requireAuthentication: true`.

## TURN relay diagnostics

Phase 2D.5 adds relay-only diagnostics to the live classroom view. Configure the
standalone development server with host-provided TURN settings before starting
the harness:

```bash
DEV_AUTH_ENABLED=true \
TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349 \
TURN_USERNAME=demo-user \
TURN_CREDENTIAL=demo-password \
TURN_FORCE_RELAY=true \
pnpm server:dev
```

For TURN services that support REST-style shared-secret credentials, use
`TURN_SHARED_SECRET` instead of `TURN_CREDENTIAL`; the server returns a bounded,
short-lived username/password pair to the browser. The live view shows whether
TURN is configured, can force `iceTransportPolicy: 'relay'`, and includes a
**Validate TURN** action that inspects selected ICE candidate pairs after two
participants negotiate media.
