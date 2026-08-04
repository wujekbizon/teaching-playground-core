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

## Mixed browser and simulated capacity test

Phase 2C combines the real browser harness with lightweight clients in one
room. The default scenario creates one teacher browser, ten isolated student
browser contexts, and 130 simulated students, for 141 concurrent participants:

```bash
pnpm --dir examples/classroom-harness exec playwright install chromium
pnpm mixed:test
```

The scenario verifies the participant view in all eleven browsers, chat in
both browser-to-simulator directions, a 130-student hand-raise burst, mute-all
delivery, ten-percent simulated-client disconnect cleanup, and the absence of
uncaught errors in every browser page. It attaches timing metrics and captures
a full-page teacher screenshot in the Playwright results directory.

For a smaller diagnostic run, override the number of lightweight students:

```bash
MIXED_SIMULATED_STUDENTS=20 pnpm mixed:test
```

The regular `pnpm harness:test` suite excludes this resource-intensive mixed
scenario; run `pnpm mixed:test` explicitly when validating capacity.

The initial local Phase 2C run completed in 57.6 seconds with all assertions
passing. Its operation timings were:

| Simulated admission | Browser admission | Browser chat | Simulated chat | Hand burst | Mute-all | 10% cleanup |
|---:|---:|---:|---:|---:|---:|---:|
| 754 ms | 24,761 ms | 2,042 ms | 1,356 ms | 5,324 ms | 2,070 ms | 2,618 ms |

These are local regression observations, not service-level objectives.

## Initial local baseline

The following development-container results were recorded with batches of 20.
They are regression baselines, not production capacity guarantees.

| Students | Connections | Admission p95 | Chat fan-out | Hand burst | Mute-all | 10% cleanup | Heap growth |
|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 101 | 99 ms | 10 ms | 204 ms | 11 ms | 22 ms | 9.9 MB |
| 120 | 121 | 97 ms | 28 ms | 314 ms | 16 ms | 28 ms | 18.0 MB |
| 140 | 141 | 83 ms | 10 ms | 278 ms | 11 ms | 30 ms | 12.7 MB |

## Limits of this test

The lightweight test measures only the Socket.IO control plane on one process
and one machine. The mixed test adds eleven real browser renderers and their
WebRTC peer negotiation, but its 130 simulated clients do not publish or answer
media. Neither test creates 141 media publishers, TURN traffic, multiple server
instances, Redis-backed shared state, or a remote network path. Perform separate
TURN, multi-instance, soak, and production-network validation before making a
stakeholder capacity commitment.
