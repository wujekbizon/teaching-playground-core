import TeachingPlayground from '../engine/TeachingPlayground'

describe('TeachingPlayground authorization', () => {
  it('stops an unauthorized lecture operation before creating data', async () => {
    const playground = new TeachingPlayground({})
    playground.setCurrentUser({
      id: 'student-1',
      username: 'student',
      role: 'student',
      status: 'online',
    })

    await expect(playground.scheduleLecture({
      name: 'Forbidden lecture',
      date: new Date().toISOString(),
      roomId: 'room-1',
    })).rejects.toMatchObject({ code: 'LECTURE_SCHEDULING_FAILED' })

    await expect(playground.listLectures('room-1')).resolves.toHaveLength(0)
  })

  it('shares one communication system with room management', () => {
    const playground = new TeachingPlayground({})
    expect(playground.roomSystem.getCommsSystem()).toBe(
      (playground as unknown as { commsSystem: unknown }).commsSystem
    )
  })
})

class MemoryPersistence {
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

describe('TeachingPlayground Phase 2E public API', () => {
  it('schedules and filters reservations by normalized academic path through the public API', async () => {
    const persistence = new MemoryPersistence()
    const playground = new TeachingPlayground({ persistence: persistence as any })
    playground.setCurrentUser({
      id: 'teacher-1', username: 'teacher@example.com', role: 'teacher', status: 'online', organizationId: 'school-a',
    })
    const room = await playground.createRoom({ name: 'Academic Room', capacity: 30 })
    const academicPath = {
      programId: 'medical-assistant', curriculumId: 'medical-assistant-2026', termId: 'fall-2026',
      courseId: 'semester-1', subjectId: 'anatomy', cohortId: 'group-a',
    }

    const reservation = await playground.scheduleReservation({
      roomId: room.id, name: 'Anatomy lecture', startsAt: '2026-09-01T10:00:00.000Z',
      endsAt: '2026-09-01T11:00:00.000Z', timezone: 'UTC', capacity: 20, academicPath,
    })

    await expect(playground.listReservations({ termId: 'fall-2026', subjectId: 'anatomy' }))
      .resolves.toEqual([expect.objectContaining({ id: reservation.id, organizationId: 'school-a', academicPath })])
    await expect(playground.listReservations({ cohortId: 'group-b' })).resolves.toEqual([])
  })

  it('captures and reads attendance reports through the public API', async () => {
    const persistence = new MemoryPersistence()
    const playground = new TeachingPlayground({ persistence: persistence as any })
    playground.setCurrentUser({
      id: 'teacher-1', username: 'teacher@example.com', role: 'teacher', status: 'online', organizationId: 'school-a',
    })
    const room = await playground.createRoom({ name: 'Attendance Room', capacity: 30 })
    const reservation = await playground.scheduleReservation({
      roomId: room.id, name: 'Attendance lecture', startsAt: '2026-09-01T10:00:00.000Z',
      endsAt: '2026-09-01T11:00:00.000Z', timezone: 'UTC', capacity: 20,
    })
    persistence.data.events[0].status = 'completed'

    await playground.captureAttendanceSnapshot({ reservationId: reservation.id, capturedBy: 'teacher-1',
      capturedAt: '2026-09-01T10:30:00.000Z', participants: [{ userId: 'student-1', role: 'student' }] })
    const report = await playground.finalizeAttendanceReport(reservation.id)

    await expect(playground.getAttendanceReport(reservation.id)).resolves.toEqual(report)
    expect(report.totals).toMatchObject({ participants: 1, students: 1, snapshots: 1 })
  })
})
