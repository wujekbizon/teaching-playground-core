# Phase 2E Option A Plan — Normalized Academic Model

**Date:** 2026-08-05  
**Product direction:** Wolfmed Klasa, powered internally by Wolfmed Classroom Engine  
**Implementation target:** Single backend instance first; Redis/horizontal scaling remains paused  
**Decision:** Use Option A — one normalized academic hierarchy

## 1. Purpose

This plan captures the next product direction before Phase 2D.6 Redis work. The
current priority is not multi-instance scaling. The priority is to make the
single-backend classroom engine represent real school academic scheduling in a
host-agnostic way.

Teaching Playground / Wolfmed Classroom Engine should not become a Wolfmed
monolith module that owns accounts, payments, course purchases, teacher-seat
licensing, exams, or learning materials. Instead, Wolfmed Klasa or another host
application depends on the classroom engine and maps its own business records
into the engine's normalized academic IDs.

## 2. Architecture decision: Option A

Use one normalized hierarchy for all schools and host platforms:

```text
Organization → AcademicProgram → Curriculum → AcademicTerm → Course → Subject → Cohort → LectureReservation
```

This is intentionally stricter than a plugin-based curriculum mapper. Schools
may keep different internal curriculum structures, names, billing rules, and
commercial packages in the host application, but they must map those records
into this predictable engine shape when scheduling classroom reservations.

## 3. Why Option A now

Option A gives the engine a stable data model for:

- scheduling school semesters;
- representing courses, subjects, cohorts, and lecture reservations;
- filtering reservations by academic path;
- generating attendance reports later;
- connecting live lectures to host-owned exams and materials later;
- avoiding Wolfmed-specific code inside the engine;
- delaying plugin complexity until real onboarding evidence proves it is needed.

The plugin/mapping approach remains a possible future extension, but it should
not be implemented before we validate the normalized model with real school
workflows.

## 4. Responsibility boundary

| Classroom engine owns | Host application owns |
|---|---|
| Normalized academic IDs and reservation links | Login, accounts, sessions, and identity provider |
| Rooms, room availability, turnover, and capacity | Payments, course purchases, subscriptions, and school billing |
| Reservation lifecycle and runtime admission mechanics | Teacher-seat or student-seat commercial policy |
| Presence, classroom events, media signaling, and TURN configuration | Canonical curriculum/product data if it already exists in Wolfmed or another system |
| Attendance capture/reporting in a later phase | Exams, learning materials, certificates, and content workflows |
| External references back to host records | Deciding whether a user is commercially allowed to launch a lecture |

The classroom engine may verify a trusted launch decision from the host, but it
must not ask Wolfmed payment/enrollment services directly whether a student has
paid. That decision belongs to Wolfmed or the host application.

## 5. Required normalized entities

### Organization

School/client tenant boundary.

### AcademicProgram

Broad learning path or educational product, for example Medical Assistant,
First Aid Instructor, or another school-defined program.

### Curriculum

Versioned curriculum under a program. Different schools can have different
curriculum records, but each is mapped into the same engine shape.

### AcademicTerm

A semester or date-bounded teaching period with explicit timezone.

### Course

Student-facing course/package. In Wolfmed this may map to a paid product, but
inside the engine it is only a neutral academic ID/reference.

### Subject

Module or subject inside a course. For the discussed school scenario, five
subjects with ten reservations each become fifty lecture reservations.

### Cohort

Student group, class, or schedule cohort, for example Semester 1 — Group A,
Weekend cohort, or Online cohort.

### LectureReservation

Scheduled classroom reservation tied to a room, teacher, time interval, and the
normalized academic path.

## 6. External references

Add a generic external reference shape so host systems can map their records
without creating a Wolfmed dependency inside the engine:

```ts
interface ExternalReference {
  provider: string
  type: string
  id: string
  url?: string
  metadata?: Record<string, unknown>
}
```

Example:

```json
{ "provider": "wolfmed", "type": "course", "id": "wm-course-123" }
```

## 7. Reservation academic path

Reservations should support normalized academic references:

```ts
interface ReservationAcademicPath {
  programId: string
  curriculumId: string
  termId: string
  courseId: string
  subjectId: string
  cohortId: string
  externalRef?: ExternalReference
}
```

These fields should be queryable together with existing organization, room,
teacher, status, and date filters.

## 8. Phase 2E.0 implementation scope

- Add host-agnostic academic interfaces.
- Extend `LectureReservation` with the normalized academic path.
- Add reservation filters for program, curriculum, term, course, subject, and
  cohort IDs.
- Preserve organization isolation for every academic query and mutation.
- Update the harness scheduling flow enough to create and inspect reservations
  with academic-path fields.
- Document that schools must map different curricula into the normalized model.
- Defer plugin-based reshaping until real school onboarding proves Option A too
  rigid.

## 9. Phase 2E.0 exit criteria

A host can represent a school semester with multiple subjects and cohorts,
schedule the resulting lecture reservations through the normalized academic
path, and query them by organization, term, course, subject, or cohort without
any Wolfmed-specific dependency in the engine.

## 10. Next phases after Phase 2E.0

### Phase 2E.1 — Host-owned launch and admission contract

Define trusted launch claims from the host. The host decides whether a user may
launch the lecture; the engine verifies the trusted decision plus runtime
constraints such as organization, reservation, lifecycle, capacity, room status,
and turnover cleanup.

### Phase 2E.2 — Attendance foundation

Record durable attendance events, support teacher-triggered attendance
snapshots, and produce finalized attendance reports for completed lectures.

### Phase 2E.3 — External action bridge

Expose neutral classroom actions such as `generate_exam`, `open_materials`, and
`assign_material`, executed by host-provided handlers. Exam and material logic
remain in Wolfmed or the host application.

## 11. Redis decision

Phase 2D.6 Redis/horizontal scaling remains paused. Redis should be revisited
only after the single-backend academic scheduling, host launch contract, and
attendance workflow are validated.
