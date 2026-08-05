# TURN Relay Configuration and Validation

This guide explains how to configure TURN servers for Teaching Playground media
connections and how to verify that teacher/student WebRTC media is actually
using a relay-only path.

TURN is required when peers cannot connect directly through NAT/firewall rules.
For production classrooms, hosts should provide TURN credentials from their own
infrastructure or relay provider. The core package does not run a TURN server;
it safely passes host-provided RTC configuration to the browser harness.

## What Phase 2D.5 provides

- A development-only `/api/turn` endpoint exposed by the standalone server when
  `DEV_AUTH_ENABLED=true`.
- `buildTurnConfiguration()` for constructing browser-safe `RTCConfiguration`
  objects from environment variables.
- Static credential support for simple deployments and local validation.
- Short-lived HMAC credential generation for TURN services that support the
  common REST/shared-secret credential model.
- A Live classroom TURN panel that shows whether relay configuration is loaded,
  can force `iceTransportPolicy: 'relay'`, and can inspect selected ICE
  candidate pairs after media negotiation.
- Playwright coverage that validates the harness wiring when TURN environment
  variables are supplied.

## Environment variables

| Variable | Required? | Description |
|---|---:|---|
| `TURN_URLS` | Yes for TURN | Comma-separated TURN URLs, for example `turn:turn.example.com:3478,turns:turn.example.com:5349`. |
| `TURN_USERNAME` | Yes for static credentials; optional label for shared-secret credentials | Username sent to the TURN server. With `TURN_SHARED_SECRET`, this becomes the suffix of the generated time-limited username. |
| `TURN_CREDENTIAL` | Yes for static credentials | Static password/credential sent to the TURN server. Do not use this for shared-secret mode. |
| `TURN_SHARED_SECRET` | Yes for short-lived credentials | Shared secret used to generate HMAC-SHA1 credentials. Keep this server-side only. |
| `TURN_TTL_SECONDS` | Optional | Short-lived credential TTL. Values are clamped between 60 seconds and 3600 seconds. Defaults to 600 seconds. |
| `TURN_FORCE_RELAY` | Optional | Set to `true` or `1` to make the harness default to `iceTransportPolicy: 'relay'`. |

If `TURN_URLS` is missing, the endpoint intentionally returns a STUN-only
configuration and marks TURN as disabled so local non-relay classroom testing can
continue.

## Static credential setup

Use static credentials when your TURN service issues a stable username/password
pair for a development environment.

```bash
DEV_AUTH_ENABLED=true \
TURN_URLS=turn:turn.example.com:3478,turns:turn.example.com:5349 \
TURN_USERNAME=school-demo \
TURN_CREDENTIAL='replace-with-provider-password' \
TURN_FORCE_RELAY=true \
pnpm server:dev
```

Then start the harness in another shell:

```bash
pnpm harness:dev
```

Open `http://localhost:5173`, confirm the Live classroom TURN panel says
`Configured`, and join with two participants using unique development tokens
(for example `teacher:maya` and `student:alex`).

## Short-lived shared-secret setup

Use this mode when your TURN provider supports REST-style shared-secret
credentials. The server computes the browser credential at request time and does
not expose `TURN_SHARED_SECRET` to the browser.

```bash
DEV_AUTH_ENABLED=true \
TURN_URLS=turn:turn.example.com:3478 \
TURN_USERNAME=school-demo \
TURN_SHARED_SECRET='replace-with-provider-shared-secret' \
TURN_TTL_SECONDS=600 \
TURN_FORCE_RELAY=true \
pnpm server:dev
```

The generated browser username has this shape:

```text
<expiry-epoch-seconds>:<TURN_USERNAME-or-teaching-playground>
```

The generated browser credential is `base64(hmac-sha1(username,
TURN_SHARED_SECRET))`. Keep the shared secret in server environment variables or
a secrets manager; never ship it in frontend code.

## Validate in the browser harness

1. Start the core server with `DEV_AUTH_ENABLED=true` and TURN env vars.
2. Start the harness with `pnpm harness:dev`.
3. Open two browser tabs at `http://localhost:5173`.
4. In each tab, verify the TURN panel says `Configured`.
5. Keep **Force relay-only ICE** checked. This maps to
   `RTCConfiguration.iceTransportPolicy = 'relay'`.
6. Join the same eligible room/reservation as teacher and student.
7. Grant camera/microphone permissions and wait for remote media to appear.
8. Click **Validate TURN**. A successful relay path reports that the selected
   local ICE candidate type is `relay` for every selected candidate pair.

If validation reports no selected relay candidate pair, wait a few seconds and
try again. If it still fails, verify the credentials, firewall rules, TURN URL
scheme (`turn:` vs `turns:`), TLS certificates, and UDP/TCP availability for the
provider.

## Validate with Playwright

The normal harness E2E command skips TURN-specific assertions unless TURN env
vars are supplied:

```bash
pnpm --dir examples/classroom-harness test:e2e
```

Run the TURN diagnostics spec with explicit test credentials/configuration:

```bash
CI=1 \
TURN_URLS=turn:turn.example.test:3478 \
TURN_USERNAME=demo \
TURN_CREDENTIAL=secret \
TURN_FORCE_RELAY=true \
pnpm --dir examples/classroom-harness test:e2e --grep "TURN relay diagnostics"
```

That test verifies the `/api/turn` response and confirms the harness displays
configured relay-only mode. To prove real media relay, use a real TURN endpoint
and follow the browser harness validation steps above with two participants.

## Host application integration

Applications embedding `RoomConnection` can bypass the development endpoint and
pass their own RTC configuration directly:

```typescript
import { RoomConnection } from '@teaching-playground/core/room-connection'

const connection = new RoomConnection(roomId, user, serverUrl, {
  auth: { token },
  reservationId,
  rtcConfiguration: {
    iceTransportPolicy: 'relay',
    iceServers: [{
      urls: ['turn:turn.example.com:3478', 'turns:turn.example.com:5349'],
      username: shortLivedUsername,
      credential: shortLivedCredential,
    }],
  },
})
```

After media negotiation, call `getSelectedIceCandidatePairs()` to inspect the
selected path:

```typescript
const pairs = await connection.getSelectedIceCandidatePairs()
const relayed = pairs.length > 0 && pairs.every(pair => pair.localCandidateType === 'relay')
```

## Security guidance

- Prefer short-lived credentials in production.
- Keep static credentials and shared secrets in server-side environment
  variables or a secrets manager.
- Do not persist generated TURN credentials in logs, analytics, or classroom
  records.
- Use `turns:` where your provider supports TLS and certificate validation.
- Scope relay credentials to the organization/session where your provider
  allows it.
- Monitor TURN bandwidth separately from WebSocket/API capacity; relay media can
  become the dominant cost during multi-participant classrooms.

## Troubleshooting

| Symptom | Likely cause | Recommended action |
|---|---|---|
| TURN panel says `Not configured` | `TURN_URLS` missing or credentials incomplete | Restart the server with `TURN_URLS` plus either static credentials or `TURN_SHARED_SECRET`. |
| Browser join succeeds but no media appears | TURN unreachable, wrong protocol/port, or browser permission issue | Check browser console, provider firewall rules, and camera/microphone permissions. |
| **Validate TURN** says no relay pair | ICE has not completed or selected a non-relay candidate | Keep relay-only enabled, wait for remote media, then retry. |
| Credentials expire during a long test | TTL too short for the validation window | Increase `TURN_TTL_SECONDS` up to the 3600-second clamp. |
| Works locally but fails on school network | UDP blocked or TLS inspection/proxy rules | Add a TCP/TLS `turns:` URL and confirm provider support. |
