# Classroom Harness

This private React/Vite example exercises the browser-facing API of
`@teaching-playground/core`. It is a diagnostic tool, not the final product UI.

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
