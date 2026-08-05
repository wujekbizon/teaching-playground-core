import { EventManagementSystem } from '../systems/event/EventManagementSystem'
import type { PersistenceAdapter } from '../interfaces'

class MemoryPersistence implements PersistenceAdapter {
  data: Record<string, any[]> = { rooms: [], events: [], attendance: [], attendance_snapshots: [], attendance_reports: [] }
  async find(collection: string, query: Record<string, any> = {}) {
    return this.data[collection].filter(item => Object.entries(query).every(([key, value]) => item[key] === value))
  }
  async findOne(collection: string, query: Record<string, any>) { return (await this.find(collection, query))[0] ?? null }
  async insert(collection: string, item: Record<string, any>) { this.data[collection].push(item); return item }
  async update(collection: string, query: Record<string, any>, updates: Record<string, any>) {
    const item = await this.findOne(collection, query)
    if (!item) return null
    Object.assign(item, updates)
    return item
  }
  async delete(collection: string, query: Record<string, any>) {
    const before = this.data[collection].length
    this.data[collection] = this.data[collection].filter(item => !Object.entries(query).every(([key, value]) => item[key] === value))
    return before !== this.data[collection].length
  }
}

const base = {
  organizationId: 'school-a', roomId: 'room-a', name: 'Algebra', teacherId: 'teacher-a',
  createdBy: 'teacher-a@example.com', startsAt: '2026-09-01T10:00:00.000Z',
  endsAt: '2026-09-01T11:00:00.000Z', timezone: 'Europe/Warsaw', capacity: 20,
}

describe('EventManagementSystem reservation scheduling', () => {
  let persistence: MemoryPersistence
  let system: EventManagementSystem

  beforeEach(() => {
    persistence = new MemoryPersistence()
    persistence.data.rooms.push(
      { id: 'room-a', organizationId: 'school-a', capacity: 30, status: 'available' },
      { id: 'room-b', organizationId: 'school-a', capacity: 10, status: 'available' },
      { id: 'room-other', organizationId: 'school-b', capacity: 30, status: 'available' },
    )
    system = new EventManagementSystem(undefined, persistence)
  })

  it('allows reservations after the turnover gap and rejects overlaps or short turnover', async () => {
    const first = await system.scheduleReservation(base)
    await expect(system.scheduleReservation({ ...base, name: 'Too close before', startsAt: '2026-09-01T09:00:00.000Z',
      endsAt: '2026-09-01T09:50:00.000Z' })).rejects.toMatchObject({ code: 'RESERVATION_CONFLICT' })
    await expect(system.scheduleReservation({ ...base, name: 'Before lecture', startsAt: '2026-09-01T09:00:00.000Z',
      endsAt: '2026-09-01T09:45:00.000Z' })).resolves.toMatchObject({ status: 'scheduled' })
    await expect(system.scheduleReservation({ ...base, name: 'Short turnover', startsAt: '2026-09-01T11:10:00.000Z',
      endsAt: '2026-09-01T12:00:00.000Z' })).rejects.toMatchObject({ code: 'RESERVATION_CONFLICT' })
    await expect(system.scheduleReservation({ ...base, name: 'Geometry', startsAt: '2026-09-01T11:15:00.000Z',
      endsAt: '2026-09-01T12:00:00.000Z' })).resolves.toMatchObject({ status: 'scheduled' })
    await expect(system.scheduleReservation({ ...base, name: 'Conflict', startsAt: '2026-09-01T10:30:00.000Z',
      endsAt: '2026-09-01T11:30:00.000Z' })).rejects.toMatchObject({
      code: 'RESERVATION_CONFLICT', details: { conflict: { id: first.id } },
    })
  })

  it('serializes concurrent conflict checks so exactly one reservation wins', async () => {
    const results = await Promise.allSettled([
      system.scheduleReservation({ ...base, name: 'Concurrent one' }),
      system.scheduleReservation({ ...base, name: 'Concurrent two' }),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect(persistence.data.events).toHaveLength(1)
  })

  it('enforces organization ownership, capacity, room existence, and valid ranges', async () => {
    await expect(system.scheduleReservation({ ...base, roomId: 'room-other' })).rejects.toMatchObject({ code: 'ORGANIZATION_MISMATCH' })
    await expect(system.scheduleReservation({ ...base, roomId: 'room-b' })).rejects.toMatchObject({ code: 'ROOM_CAPACITY_EXCEEDED' })
    await expect(system.scheduleReservation({ ...base, roomId: 'missing' })).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' })
    await expect(system.scheduleReservation({ ...base, endsAt: base.startsAt })).rejects.toMatchObject({ code: 'INVALID_TIME_RANGE' })
  })

  it('scopes range queries and availability to an organization', async () => {
    const existing = await system.scheduleReservation(base)
    await system.scheduleReservation({ ...base, roomId: 'room-b', capacity: 5, startsAt: '2026-09-01T11:15:00.000Z',
      endsAt: '2026-09-01T12:15:00.000Z' })
    await expect(system.listReservations({ organizationId: 'school-a', from: '2026-09-01T09:30:00.000Z',
      to: '2026-09-01T10:30:00.000Z' })).resolves.toHaveLength(1)
    const rooms = await system.getRoomAvailability({ organizationId: 'school-a', startsAt: base.startsAt,
      endsAt: base.endsAt, capacity: 5 })
    expect(rooms.map(room => room.id)).toEqual(['room-b'])
    const rescheduleRooms = await system.getRoomAvailability({ organizationId: 'school-a', startsAt: base.startsAt,
      endsAt: base.endsAt, capacity: 20, excludeReservationId: existing.id })
    expect(rescheduleRooms.map(room => room.id)).toEqual(['room-a'])
  })


  it('stores and filters reservations by normalized academic path inside the organization scope', async () => {
    const academicPath = {
      programId: 'medical-assistant', curriculumId: 'medical-assistant-2026', termId: 'fall-2026',
      courseId: 'semester-1', subjectId: 'anatomy', cohortId: 'group-a',
      externalRef: { provider: 'wolfmed', type: 'course', id: 'wm-course-123' },
    }
    const reservation = await system.scheduleReservation({ ...base, academicPath })
    await system.scheduleReservation({ ...base, name: 'Physiology', roomId: 'room-b', capacity: 5,
      startsAt: '2026-09-01T11:15:00.000Z', endsAt: '2026-09-01T12:15:00.000Z',
      academicPath: { ...academicPath, subjectId: 'physiology', cohortId: 'group-b' } })

    await expect(system.listReservations({ organizationId: 'school-a', termId: 'fall-2026', subjectId: 'anatomy' }))
      .resolves.toEqual([expect.objectContaining({ id: reservation.id, academicPath })])
    await expect(system.listReservations({ organizationId: 'school-a', courseId: 'semester-1', cohortId: 'group-b' }))
      .resolves.toHaveLength(1)
    await expect(system.listReservations({ organizationId: 'school-b', termId: 'fall-2026' }))
      .resolves.toHaveLength(0)
    await expect(system.scheduleReservation({ ...base, roomId: 'room-b', capacity: 5,
      startsAt: '2026-09-01T12:30:00.000Z', endsAt: '2026-09-01T13:30:00.000Z',
      academicPath: { ...academicPath, subjectId: '' } })).rejects.toMatchObject({ code: 'EVENT_VALIDATION_FAILED' })
  })

  it('reschedules without self-conflict and releases cancelled intervals', async () => {
    const reservation = await system.scheduleReservation(base)
    const moved = await system.rescheduleReservation(reservation.id, 'school-a', {
      startsAt: '2026-09-01T12:00:00.000Z', endsAt: '2026-09-01T13:00:00.000Z',
    })
    expect(moved.startsAt).toBe('2026-09-01T12:00:00.000Z')
    await system.cancelReservation(reservation.id, 'school-a', 'Teacher unavailable')
    await expect(system.scheduleReservation(base)).resolves.toMatchObject({ status: 'scheduled' })
  })


  it('captures attendance snapshots and finalizes an idempotent completed lecture report', async () => {
    const reservation = await system.scheduleReservation(base)
    persistence.data.events[0].status = 'completed'
    await system.recordAttendanceEvent({ organizationId: 'school-a', reservationId: reservation.id,
      type: 'joined', userId: 'teacher-a', role: 'teacher', occurredAt: '2026-09-01T10:00:00.000Z' })
    const snapshot = await system.captureAttendanceSnapshot({ organizationId: 'school-a', reservationId: reservation.id,
      capturedBy: 'teacher-a', capturedAt: '2026-09-01T10:30:00.000Z', participants: [
        { userId: 'teacher-a', role: 'teacher', displayName: 'Teacher A' },
        { userId: 'student-1', role: 'student', displayName: 'Student One' },
      ] })
    expect(snapshot.participants).toHaveLength(2)

    const report = await system.finalizeAttendanceReport('school-a', reservation.id)
    expect(report).toMatchObject({ organizationId: 'school-a', reservationId: reservation.id,
      totals: { participants: 2, teachers: 1, students: 1, admins: 0, events: 3, snapshots: 2 } })
    expect(report.participants).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'teacher-a', eventCount: 2, snapshotCount: 1 }),
      expect.objectContaining({ userId: 'student-1', eventCount: 1, snapshotCount: 1 }),
    ]))
    await expect(system.finalizeAttendanceReport('school-a', reservation.id)).resolves.toEqual(report)
  })

  it('enforces attendance tenant, lifecycle, time, and unique snapshot validation', async () => {
    const reservation = await system.scheduleReservation(base)
    await expect(system.recordAttendanceEvent({ organizationId: 'school-b', reservationId: reservation.id,
      type: 'joined', userId: 'student-1', role: 'student' })).rejects.toMatchObject({ code: 'ORGANIZATION_MISMATCH' })
    await expect(system.recordAttendanceEvent({ organizationId: 'school-a', reservationId: reservation.id,
      type: 'joined', userId: 'student-1', role: 'student', occurredAt: 'not-a-date' })).rejects.toMatchObject({ code: 'INVALID_TIME_RANGE' })
    await expect(system.recordAttendanceEvent({ organizationId: 'school-a', reservationId: reservation.id,
      type: 'teleported' as never, userId: 'student-1', role: 'student' })).rejects.toMatchObject({ code: 'EVENT_VALIDATION_FAILED' })
    await expect(system.captureAttendanceSnapshot({ organizationId: 'school-a', reservationId: reservation.id,
      capturedBy: 'teacher-a', participants: [{ userId: 'student-1', role: 'student' }, { userId: 'student-1', role: 'student' }] }))
      .rejects.toMatchObject({ code: 'EVENT_VALIDATION_FAILED' })
    await expect(system.finalizeAttendanceReport('school-a', reservation.id)).rejects.toMatchObject({ code: 'ROOM_UNAVAILABLE' })
    persistence.data.events[0].status = 'cancelled'
    await expect(system.captureAttendanceSnapshot({ organizationId: 'school-a', reservationId: reservation.id,
      capturedBy: 'teacher-a', participants: [] })).rejects.toMatchObject({ code: 'ROOM_UNAVAILABLE' })
  })

  it('updates reservation details while preserving tenant and capacity rules', async () => {
    const reservation = await system.scheduleReservation(base)
    await expect(system.updateReservation(reservation.id, 'school-a', { name: 'Advanced Algebra', capacity: 25 }))
      .resolves.toMatchObject({ name: 'Advanced Algebra', capacity: 25, organizationId: 'school-a' })
    await expect(system.updateReservation(reservation.id, 'school-b', { name: 'Forbidden update' }))
      .rejects.toMatchObject({ code: 'ORGANIZATION_MISMATCH' })
    await expect(system.updateReservation(reservation.id, 'school-a', { capacity: 31 }))
      .rejects.toMatchObject({ code: 'ROOM_CAPACITY_EXCEEDED' })
  })
})
