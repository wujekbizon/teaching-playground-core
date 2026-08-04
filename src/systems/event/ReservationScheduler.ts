import { Mutex } from 'async-mutex'
import type { EventConfig, LectureReservation, PersistenceAdapter } from '../../interfaces'
import { RealTimeCommunicationSystem } from '../comms/RealTimeCommunicationSystem'

export interface SchedulerRunReport {
  checked: number
  transitioned: number
  claimedRooms: number
  ranAt: string
}

/** Single-process, idempotent reservation lifecycle worker. */
export class ReservationScheduler {
  private readonly mutex = new Mutex()
  private timer: NodeJS.Timeout | null = null
  private claimedLectureIds = new Set<string>()
  private readonly earlyAdmissionMs: number
  private readonly completionGraceMs: number
  private readonly intervalMs: number

  constructor(
    private readonly persistence: PersistenceAdapter,
    private readonly comms: RealTimeCommunicationSystem,
    config: EventConfig = {},
    private readonly now: () => number = Date.now,
  ) {
    this.earlyAdmissionMs = config.earlyAdmissionMs ?? 10 * 60_000
    this.completionGraceMs = config.completionGraceMs ?? 5 * 60_000
    this.intervalMs = config.schedulerIntervalMs ?? 15_000
    if (this.earlyAdmissionMs < 0 || this.completionGraceMs < 0 || this.intervalMs < 100) {
      throw new Error('Scheduler timing values must be non-negative and interval must be at least 100ms')
    }
  }

  start(): void {
    if (this.timer) return
    void this.runOnce()
    this.timer = setInterval(() => { void this.runOnce() }, this.intervalMs)
    this.timer.unref()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async runOnce(): Promise<SchedulerRunReport> {
    return this.mutex.runExclusive(async () => {
      const current = this.now()
      const reservations = await this.persistence.find('events', { type: 'lecture' }) as LectureReservation[]
      const managed = reservations.filter(item => item.organizationId && item.startsAt && item.endsAt)
      let transitioned = 0

      for (const reservation of managed) {
        const start = Date.parse(reservation.startsAt)
        const end = Date.parse(reservation.endsAt)
        let status = reservation.status
        if (status === 'scheduled' && current >= start - this.earlyAdmissionMs) status = 'open'
        if ((status === 'scheduled' || status === 'open') && current >= start) status = 'in-progress'
        if (status === 'in-progress' && current >= end + this.completionGraceMs) status = 'completed'
        if (status !== reservation.status) {
          await this.persistence.update('events', { id: reservation.id }, { status,
            metadata: { ...reservation.metadata, lastModified: new Date(current).toISOString() } })
          reservation.status = status
          transitioned += 1
          if (status === 'completed') {
            this.comms.updateLectureStatus(reservation.id, status)
            this.comms.clearRoom(reservation.roomId)
            this.comms.unregisterLecture(reservation.id)
          }
        }
      }

      const claims = new Map<string, LectureReservation>()
      for (const reservation of managed.filter(item => item.status !== 'completed' && item.status !== 'cancelled')) {
        const existing = claims.get(reservation.roomId)
        if (!existing || this.claimPriority(reservation, current) < this.claimPriority(existing, current)) {
          claims.set(reservation.roomId, reservation)
        }
      }
      const nextClaimIds = new Set([...claims.values()].map(item => item.id))
      for (const lectureId of this.claimedLectureIds) {
        if (!nextClaimIds.has(lectureId)) this.comms.unregisterLecture(lectureId)
      }
      for (const reservation of claims.values()) {
        this.comms.registerLecture(reservation.id, reservation.roomId, reservation.status, reservation.capacity, reservation.organizationId)
      }
      this.claimedLectureIds = nextClaimIds
      return { checked: managed.length, transitioned, claimedRooms: claims.size, ranAt: new Date(current).toISOString() }
    })
  }

  private claimPriority(reservation: LectureReservation, current: number): number {
    const start = Date.parse(reservation.startsAt)
    const end = Date.parse(reservation.endsAt)
    if (current >= start && current < end) return 0
    if (current >= start - this.earlyAdmissionMs && current < start) return 1
    if (current >= end && current < end + this.completionGraceMs) return 2
    return 3 + Math.abs(start - current)
  }
}
