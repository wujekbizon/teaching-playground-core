# Classroom load testing

The lightweight simulator exercises one authenticated teacher and a configurable
number of authenticated students against an isolated in-process server:

```bash
pnpm load:test --students 140
```

Optional flags are `--batch-size <n>`, `--timeout <ms>`, and `--verbose`.

## What it validates

- WebSocket connection and authenticated room admission for every client.
- One chat message delivered to the entire room.
- A simultaneous hand-raise burst from every student.
- Teacher mute-all delivery to the entire room.
- Cleanup after ten percent of students disconnect simultaneously.
- Admission percentiles, operation latency, event-loop delay, heap growth, and
  total scenario duration.

The command exits non-zero when any expected connection or fan-out event is
missing or an operation times out.

## Initial local baseline

The following development-container results were recorded with batches of 20.
They are regression baselines, not production capacity guarantees.

| Students | Connections | Admission p95 | Chat fan-out | Hand burst | Mute-all | 10% cleanup | Heap growth |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 101 | 99 ms | 10 ms | 204 ms | 11 ms | 22 ms | 9.9 MB |
| 120 | 121 | 97 ms | 28 ms | 314 ms | 16 ms | 28 ms | 18.0 MB |
| 140 | 141 | 83 ms | 10 ms | 278 ms | 11 ms | 30 ms | 12.7 MB |

## Limits of this test

This test measures the Socket.IO control plane on one process and one machine.
It does **not** create browser renderers, WebRTC peer connections, camera tracks,
TURN traffic, multiple server instances, Redis-backed shared state, or a remote
network path. Use the Playwright harness for real-browser behavior and perform
separate TURN, multi-instance, soak, and production-network validation before
making a stakeholder capacity commitment.
