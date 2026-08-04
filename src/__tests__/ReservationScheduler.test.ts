import { ReservationScheduler } from '../systems/event/ReservationScheduler'
import type { LectureReservation, PersistenceAdapter } from '../interfaces'
import type { RealTimeCommunicationSystem } from '../systems/comms/RealTimeCommunicationSystem'

class MemoryPersistence implements PersistenceAdapter {
  constructor(public events: LectureReservation[]) {}
  async find(collection: string) { return collection === 'events' ? this.events : [] }
  async findOne(_collection: string, query: Record<string, any>) { return this.events.find(item => item.id === query.id) ?? null }
  async insert(_collection: string, item: Record<string, any>) { this.events.push(item as LectureReservation); return item }
  async update(_collection: string, query: Record<string, any>, updates: Record<string, any>) {
    const item = this.events.find(event => event.id === query.id); if (!item) return null
    Object.assign(item, updates); return item
  }
  async delete() { return false }
}

const reservation = (id = 'lecture-1', roomId = 'room-1', startsAt = '2026-09-01T10:00:00.000Z', endsAt = '2026-09-01T11:00:00.000Z'): LectureReservation => ({
  id, organizationId: 'school-a', roomId, name: id, teacherId: 'teacher-a', createdBy: 'admin-a',
  startsAt, endsAt, date: startsAt, timezone: 'UTC', capacity: 2, type: 'lecture', status: 'scheduled',
})

describe('ReservationScheduler', () => {
  let now: number
  let persistence: MemoryPersistence
  let comms: jest.Mocked<Pick<RealTimeCommunicationSystem, 'registerLecture' | 'updateLectureStatus' | 'unregisterLecture' | 'clearRoom'>>

  beforeEach(() => {
    now = Date.parse('2026-09-01T09:49:00.000Z')
    persistence = new MemoryPersistence([reservation()])
    comms = { registerLecture: jest.fn(), updateLectureStatus: jest.fn(), unregisterLecture: jest.fn(), clearRoom: jest.fn() }
  })

  const scheduler = () => new ReservationScheduler(persistence, comms as unknown as RealTimeCommunicationSystem,
    { earlyAdmissionMs: 10 * 60_000, completionGraceMs: 5 * 60_000 }, () => now)

  it('moves scheduled to open, in-progress, and completed at deterministic boundaries', async () => {
    const worker = scheduler()
    await expect(worker.runOnce()).resolves.toMatchObject({ transitioned: 0, claimedRooms: 1 })
    expect(comms.registerLecture).toHaveBeenLastCalledWith('lecture-1', 'room-1', 'scheduled', 2, 'school-a')
    now = Date.parse('2026-09-01T09:50:00.000Z'); await worker.runOnce()
    expect(persistence.events[0].status).toBe('open')
    now = Date.parse('2026-09-01T10:00:00.000Z'); await worker.runOnce()
    expect(persistence.events[0].status).toBe('in-progress')
    now = Date.parse('2026-09-01T11:05:00.000Z'); await worker.runOnce()
    expect(persistence.events[0].status).toBe('completed')
    expect(comms.clearRoom).toHaveBeenCalledWith('room-1')
    expect(comms.unregisterLecture).toHaveBeenCalledWith('lecture-1')
  })

  it('is idempotent when duplicate ticks run at the same time', async () => {
    now = Date.parse('2026-09-01T09:50:00.000Z')
    const worker = scheduler()
    expect((await worker.runOnce()).transitioned).toBe(1)
    expect((await worker.runOnce()).transitioned).toBe(0)
    expect(persistence.events[0].status).toBe('open')
  })

  it('rebuilds lifecycle and admission claims from persistence after restart', async () => {
    now = Date.parse('2026-09-01T10:30:00.000Z')
    const restarted = scheduler()
    await restarted.runOnce()
    expect(persistence.events[0].status).toBe('in-progress')
    expect(comms.registerLecture).toHaveBeenCalledWith('lecture-1', 'room-1', 'in-progress', 2, 'school-a')
  })

  it('gives an adjacent current reservation the room claim during prior grace', async () => {
    const previous = reservation('previous')
    previous.status = 'in-progress'
    persistence.events = [previous, reservation('next', 'room-1', '2026-09-01T11:00:00.000Z', '2026-09-01T12:00:00.000Z')]
    now = Date.parse('2026-09-01T11:00:00.000Z')
    await scheduler().runOnce()
    expect(comms.registerLecture).toHaveBeenLastCalledWith('next', 'room-1', 'in-progress', 2, 'school-a')
  })
})
