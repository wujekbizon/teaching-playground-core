# Teaching Playground Core — Baseline Audit

**Audit date:** 2026-08-03  
**Audited package version:** 1.4.6

**Remediated release version:** 2.0.0

**Branch:** `claude/teaching-playground-analysis-vt9mtc`

> **Remediation status:** The P0, P1, and immediately actionable P2 findings in
> this audit were addressed in the follow-up implementation. Socket identities
> can now be required and resolved by a host-provided identity provider; socket
> actions are bound to membership; facade authorization is synchronous; systems
> share one comms instance; lint/package gates work; tests are deterministic;
> persistence and ICE configuration are injectable; and lifecycle shutdown is
> real. The observations below are retained as the pre-remediation baseline.

### Follow-up validation

- TypeScript build and ESLint now pass.
- The complete suite passes with 231/231 tests in three consecutive serial runs
  and exits without the previous open-handle warning.
- The package smoke test completes all eight steps and creates the tarball.
- The fresh-consumer script now uses current APIs and propagates failures. Its
  execution in this container is limited by registry policy (HTTP 403 while
  resolving fresh dependencies), rather than a suppressed package error.

## 1. Purpose and decision gate

This audit establishes the reproducible state of the existing package before deciding whether the next milestone should be a browser test harness or backend remediation. It covers the repository's documented build, lint, Jest, package, and consumer-integration commands, plus a focused review of the classroom lifecycle and trust boundaries.

**Recommendation: work on the backend first.** A minimal browser harness is still necessary for real camera, microphone, screen-sharing, recording, and multi-tab WebRTC validation, but building it immediately would put a UI on top of an unauthenticated socket boundary, split real-time state, a broken lint/package gate, and an unstable test suite. Fix the P0/P1 items below, then build the harness against a stable public contract.

## 2. Executive summary

The project compiles and produces a plausible npm tarball. Most automated behavior tests pass, including focused coverage for room lifecycle, recording, participant controls, database caching, and package exports. The baseline is not currently release-ready:

- ESLint cannot start because ESLint 9 is installed without a flat configuration file.
- The full Jest suite is unstable. Two consecutive runs produced 8 and 9 failures respectively, with the known classroom timeout plus failures in event/comms integration.
- Jest reports open asynchronous handles after completion.
- The package smoke-test pipeline stops at lint, so it never creates the tarball required by the consumer test.
- The consumer integration script contains stale API examples and suppresses failure of its functionality test.
- Socket identity, role, room membership, and privileged requester IDs are supplied by the client and are not bound to an authenticated server-side identity.
- `TeachingPlayground` creates a live comms system independently from the one owned by `RoomManagementSystem`, splitting participant/resource state.
- Facade authorization is asynchronous but is called without `await`, so protected operations can continue after authorization rejects.

## 3. Validation results

| Check | Result | Observation |
|---|---|---|
| `pnpm build` | **Pass** | TypeScript compilation completed successfully. |
| `pnpm lint` | **Fail** | ESLint 9.22.0 could not find `eslint.config.js`, `.mjs`, or `.cjs`. |
| `pnpm exec jest --runInBand --silent` | **Fail / unstable** | Run 1: 219 passed, 8 failed (227 total; 2 suites failed). Run 2: 218 passed, 9 failed (227 total; 3 suites failed). Jest also reported that it did not exit after the run. |
| `pnpm test:package` | **Fail** | Stops at its lint step before build/tarball verification. |
| `pnpm test:integration` | **Blocked by prior check** | Reports no tarball because `test:package` did not reach its packing step. |
| `pnpm pack:inspect` | **Pass with warnings** | Build and dry-run pack completed; 41 files, approximately 36.7 kB packed and 172.2 kB unpacked. npm printed environment-configuration deprecation warnings. |

### Test failures observed

1. `Hotfix.v1.4.1-v1.4.2.test.ts` consistently times out in the complete-classroom scenario after 15 seconds while waiting for `done()`.
2. `EventManagementSystem.roomCleanup.test.ts` produced seven `EVENT_UPDATE_FAILED` failures in one run, while passing in another run. This is cross-test state or mocking instability, not a dependable green baseline.
3. `EventManagementSystem.lectureLifecycle.test.ts` intermittently failed because `registerLecture` was not observed when moving a lecture to `in-progress`.
4. Jest reports lingering asynchronous work. `RealTimeCommunicationSystem.initialize()` starts a recurring cleanup interval, so every initialized instance must be shut down reliably by its owner and by test teardown.

The repository map's historical statement of 173 passing tests and one timeout is therefore stale relative to the installed suite, which now discovers 227 tests.

## 4. Prioritized findings

### P0 — Security: the socket trusts client identity and authorization claims

The server accepts the complete `User` object during `join_room` and stores its client-provided role. Privileged events separately accept a client-provided `requesterId`; raise/lower-hand events accept a client-provided `userId`; chat accepts client-provided author fields; and recording notifications accept a client-provided `teacherId`. Authorization helpers search the in-memory participant list using those values, but there is no authenticated identity bound to `socket.data` and no proof that the requesting socket owns the claimed participant.

**Impact:** a malicious client can claim a teacher/admin role or another participant's ID and attempt teacher controls, impersonation, or false recording notifications.

**Required remediation:** introduce a socket authentication hook/adapter, derive the current user from server-validated socket context, verify room membership using `socket.id`, and ignore identity/role/requester fields in event payloads. Keep authentication framework-neutral so a future host platform can provide JWT/session verification.

### P0 — Authorization: protected facade checks are not awaited

`TeachingPlayground.ensureUserAuthorized()` is declared `async`, but `scheduleLecture`, `getTeacherLectures`, `updateLecture`, and `cancelLecture` call it without `await`. An async rejection does not stop the surrounding synchronous flow at that call site.

**Impact:** unauthorized or absent users can reach subsequent code, and failures may appear as unhandled promise rejections or unrelated null-access errors rather than a reliable authorization denial.

**Required remediation:** make the check synchronous because it performs no asynchronous work, or await every call; add negative authorization tests proving no database/comms side effects occur.

### P1 — Architecture: multiple authoritative comms instances split live state

`TeachingPlayground` creates `RoomManagementSystem` and its own `RealTimeCommunicationSystem`. `RoomManagementSystem` also constructs a private `RealTimeCommunicationSystem`. Only the facade instance is injected into `EventManagementSystem`.

**Impact:** room participant queries, room allocation/deallocation, lecture admission, and the initialized Socket.IO server can operate on different maps. A room created through the facade is set up on two instances, while `roomSystem.getRoomParticipants()` reads the private, non-live instance.

**Required remediation:** constructor-inject one comms instance into room and event systems. Define ownership so only the top-level composition root initializes and shuts it down. Add identity-based regression tests showing every subsystem references the same instance.

### P1 — Quality gate: lint and package validation are broken

The project uses ESLint 9 but has no flat configuration. `test-package.sh` runs lint before tests/build/pack, so one missing config disables the entire release smoke test.

**Required remediation:** add an ESLint 9 flat configuration, resolve the resulting findings, and keep `pnpm lint` as a mandatory package gate.

### P1 — Tests: the suite is nondeterministic and leaks asynchronous work

The event-management failures changed between consecutive identical serial runs. The complete-classroom callback test consistently timed out. Jest also detected lingering work after completion.

**Required remediation:** isolate/reset the `JsonDatabase` singleton per test, avoid mock reset behavior that invalidates shared injected mocks, replace callback/event step chains with explicit promises and bounded event waiters, and ensure every initialized comms system invokes `shutdown()` in teardown. Then run the suite repeatedly to prove stability.

### P1 — Consumer test gives false confidence

`test-in-project.sh` constructs `TeachingPlayground` with a number, calls APIs that are not in the current facade (`createRoom`, `getRooms`), and invokes `initialize()` without its required config. More seriously, the functionality command ends with `|| true`, so compilation/runtime failures do not fail the script.

**Required remediation:** rewrite the fixture against the current exported API, use the packed tarball exactly as a consumer would, and remove error suppression. The script should clean up its temporary directory and return nonzero on any compile or runtime failure.

### P2 — Lifecycle and observability contracts are incomplete

The facade's `shutdown`, `initialize`, communication setup, state save/load, and restart methods are placeholders, while `getSystemStatus()` always reports healthy. The lower-level comms system has real shutdown behavior, but the facade does not delegate to it.

**Required remediation:** either implement these public methods with meaningful behavior or remove/deprecate them before consumers depend on them. Health should report initialized state and dependency readiness rather than constants.

### P2 — Production infrastructure is intentionally MVP-grade

Persistence is a process-local JSON file and live room state is held in process memory. TURN configuration and a multi-instance Socket.IO adapter are absent.

**Required remediation:** do not select concrete production infrastructure yet. First define persistence, identity, ICE-server, and real-time adapter interfaces. That preserves the option to publish an npm package, deploy a service, or support both.

### P2 — Package metadata/documentation conflict

`package.json` declares MIT licensing and public npm access, while the repository map describes a privately licensed, non-public package. This must be resolved before the next publication.

## 5. What is working

The audit does not suggest rewriting the project. Useful foundations already exist:

- Strict TypeScript compilation succeeds.
- The dry-run package contains JavaScript and declaration outputs for the documented public entry point.
- Focused tests pass for room admission rules, room cleanup, participant controls, recording notifications, browser recording logic, package exports, and JSON database caching.
- Lecture status transitions and room availability have meaningful test coverage, even though their integration setup is currently unstable.
- The client SDK exposes the capabilities needed by a future browser harness.

## 6. Recommended sequence before the frontend decision

### Backend stabilization milestone (recommended next)

1. Add working ESLint 9 configuration and restore the package gate.
2. Fix the unawaited authorization check and add denial/side-effect tests.
3. Add a pluggable socket identity provider and bind authorization to the requesting socket.
4. Inject one `RealTimeCommunicationSystem` into all dependent systems.
5. Stabilize Jest, eliminate the callback timeout, and close all handles.
6. Repair the packed-consumer integration script and make failures authoritative.
7. Re-run all six baseline commands until they pass repeatedly.

### Decision gate after stabilization

Once the above milestone is green, choose between:

- **Frontend harness next** if the goal is to validate actual browser media, two-tab negotiation, screen sharing, reconnection, recording, and user-facing cleanup.
- **Backend adapters next** if the host platform's authentication, database, or deployment topology is already known and integration contracts must be established first.

The recommended default is the frontend harness at that point, because browser media behavior cannot be proven by the Node/Jest suite alone. It should remain an internal example application consuming only public package APIs, not a commitment to the final product architecture.

## 7. Exit criteria for the baseline-remediation milestone

- `pnpm build`, `pnpm lint`, full Jest, package smoke, consumer integration, and dry-run pack all pass.
- Three consecutive serial Jest runs produce identical passing results and exit without open-handle warnings.
- An unauthenticated socket cannot join a protected classroom.
- A student cannot gain teacher privileges by changing payload fields.
- All systems created by `TeachingPlayground` use one comms instance.
- The packed consumer fixture compiles and exercises current APIs without suppressing failures.
- No decision about npm package versus standalone service is required to meet these criteria.
