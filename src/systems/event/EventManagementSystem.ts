import { SystemError, ErrorCode } from '../../interfaces/errors.interface'
import { AttendanceEvent, AttendanceReport, AttendanceReportParticipant, AttendanceSnapshot, CaptureAttendanceSnapshotOptions, EventConfig, Lecture, LectureReservation, EventOptions, PersistenceAdapter, RecordAttendanceEventOptions, ReservationFilter, ScheduleLectureOptions } from '../../interfaces'
import { CreateLectureSchema, UpdateLectureSchema } from '../../interfaces/schema'
import { JsonDatabase } from '../../utils/JsonDatabase'
import { RealTimeCommunicationSystem } from '../comms/RealTimeCommunicationSystem'
import { randomUUID } from 'crypto'
import { Mutex } from 'async-mutex'

export class EventManagementSystem {
  private db: PersistenceAdapter
  private commsSystem: RealTimeCommunicationSystem | null = null
  private reservationMutex = new Mutex()
  private readonly roomTurnoverMs: number

  private static activeReservation(status: LectureReservation['status']): boolean {
    return status !== 'cancelled' && status !== 'completed'
  }

  private static parseRange(startsAt: string, endsAt: string): { start: number; end: number } {
    const instantPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/
    const start = Date.parse(startsAt)
    const end = Date.parse(endsAt)
    if (!instantPattern.test(startsAt) || !instantPattern.test(endsAt) ||
        !Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      throw new SystemError('INVALID_TIME_RANGE', 'startsAt and endsAt must be valid ISO timestamps with startsAt before endsAt')
    }
    return { start, end }
  }

  private async assertRoomForReservation(options: Pick<ScheduleLectureOptions, 'organizationId' | 'roomId' | 'capacity'>) {
    const room = await this.db.findOne('rooms', { id: options.roomId })
    if (!room) throw new SystemError('ROOM_NOT_FOUND', `Room ${options.roomId} not found`)
    if (room.organizationId !== options.organizationId) {
      throw new SystemError('ORGANIZATION_MISMATCH', 'Room and reservation must belong to the same organization')
    }
    if (room.status === 'maintenance') throw new SystemError('ROOM_UNAVAILABLE', `Room ${options.roomId} is in maintenance`)
    if (options.capacity > room.capacity) {
      throw new SystemError('ROOM_CAPACITY_EXCEEDED', `Requested capacity exceeds room capacity of ${room.capacity}`)
    }
    return room
  }

  private static validateAcademicPath(path: ScheduleLectureOptions['academicPath']): void {
    if (!path) return
    const required = ['programId', 'curriculumId', 'termId', 'courseId', 'subjectId', 'cohortId'] as const
    for (const key of required) {
      if (typeof path[key] !== 'string' || path[key].trim().length === 0) {
        throw new SystemError('EVENT_VALIDATION_FAILED', `academicPath.${key} is required`)
      }
    }
    if (path.externalRef) {
      for (const key of ['provider', 'type', 'id'] as const) {
        if (typeof path.externalRef[key] !== 'string' || path.externalRef[key].trim().length === 0) {
          throw new SystemError('EVENT_VALIDATION_FAILED', `academicPath.externalRef.${key} is required`)
        }
      }
    }
  }


  private static parseOptionalInstant(value: string | undefined, field: string): string {
    const timestamp = value ?? new Date().toISOString()
    if (!Number.isFinite(Date.parse(timestamp))) throw new SystemError('INVALID_TIME_RANGE', `${field} must be a valid ISO timestamp`)
    return timestamp
  }

  private static validateParticipantRef(participant: { userId: string; role: string }): void {
    if (participant.userId.trim().length === 0) throw new SystemError('EVENT_VALIDATION_FAILED', 'participant.userId is required')
    if (participant.role !== 'teacher' && participant.role !== 'student' && participant.role !== 'admin') {
      throw new SystemError('EVENT_VALIDATION_FAILED', 'participant.role is invalid')
    }
  }

  private static validateAttendanceEventType(type: string): void {
    if (type !== 'joined' && type !== 'left' && type !== 'present' && type !== 'snapshot') {
      throw new SystemError('EVENT_VALIDATION_FAILED', 'attendance type is invalid')
    }
  }

  private async requireReservation(reservationId: string, organizationId: string): Promise<LectureReservation> {
    const reservation = await this.db.findOne('events', { id: reservationId }) as LectureReservation | null
    if (!reservation) throw new SystemError('EVENT_NOT_FOUND', `Reservation ${reservationId} not found`)
    if (reservation.organizationId !== organizationId) throw new SystemError('ORGANIZATION_MISMATCH', 'Reservation belongs to another organization')
    return reservation
  }

  private async findConflict(candidate: Pick<LectureReservation, 'organizationId' | 'roomId' | 'startsAt' | 'endsAt'>, excludeId?: string) {
    const range = EventManagementSystem.parseRange(candidate.startsAt, candidate.endsAt)
    const reservations = await this.db.find('events', { type: 'lecture', organizationId: candidate.organizationId, roomId: candidate.roomId }) as LectureReservation[]
    return reservations.find(existing => existing.id !== excludeId && EventManagementSystem.activeReservation(existing.status) &&
      range.start < Date.parse(existing.endsAt) + this.roomTurnoverMs &&
      range.end > Date.parse(existing.startsAt) - this.roomTurnoverMs)
  }

  /** Conflict check and mutation are serialized for the bundled single-process adapter. */
  async scheduleReservation(options: ScheduleLectureOptions): Promise<LectureReservation> {
    return this.reservationMutex.runExclusive(async () => {
      EventManagementSystem.parseRange(options.startsAt, options.endsAt)
      if (options.name.trim().length < 3 || options.name.length > 100 ||
          !Number.isInteger(options.capacity) || options.capacity < 1) {
        throw new SystemError('EVENT_VALIDATION_FAILED', 'Reservation name and capacity are invalid')
      }
      try {
        new Intl.DateTimeFormat('en', { timeZone: options.timezone }).format()
      } catch {
        throw new SystemError('EVENT_VALIDATION_FAILED', 'timezone must be a valid IANA timezone name')
      }
      EventManagementSystem.validateAcademicPath(options.academicPath)
      await this.assertRoomForReservation(options)
      const conflict = await this.findConflict(options)
      if (conflict) throw new SystemError('RESERVATION_CONFLICT', 'The room is already reserved for this interval', { conflict })
      const now = new Date().toISOString()
      const reservation: LectureReservation = {
        id: `lecture_${randomUUID()}`, type: 'lecture', status: 'scheduled', date: options.startsAt,
        ...options, metadata: { createdAt: now, lastModified: now },
      }
      await this.db.insert('events', reservation)
      return reservation
    })
  }

  async listReservations(filter: ReservationFilter): Promise<LectureReservation[]> {
    const query: Record<string, unknown> = { type: 'lecture', organizationId: filter.organizationId }
    if (filter.roomId) query.roomId = filter.roomId
    if (filter.teacherId) query.teacherId = filter.teacherId
    if (filter.status) query.status = filter.status
    const academicFilters = {
      programId: filter.programId, curriculumId: filter.curriculumId, termId: filter.termId,
      courseId: filter.courseId, subjectId: filter.subjectId, cohortId: filter.cohortId,
    }
    const reservations = await this.db.find('events', query) as LectureReservation[]
    const from = filter.from ? Date.parse(filter.from) : Number.NEGATIVE_INFINITY
    const to = filter.to ? Date.parse(filter.to) : Number.POSITIVE_INFINITY
    if (from >= to || Number.isNaN(from) || Number.isNaN(to)) throw new SystemError('INVALID_TIME_RANGE', 'Invalid reservation query range')
    return reservations.filter(item => Date.parse(item.startsAt) < to && Date.parse(item.endsAt) > from &&
      Object.entries(academicFilters).every(([key, value]) => value === undefined || item.academicPath?.[key as keyof typeof academicFilters] === value))
  }

  async rescheduleReservation(id: string, organizationId: string, updates: { roomId?: string; startsAt?: string; endsAt: string }): Promise<LectureReservation> {
    return this.reservationMutex.runExclusive(async () => {
      const existing = await this.db.findOne('events', { id }) as LectureReservation | null
      if (!existing) throw new SystemError('EVENT_NOT_FOUND', `Reservation ${id} not found`)
      if (existing.organizationId !== organizationId) throw new SystemError('ORGANIZATION_MISMATCH', 'Reservation belongs to another organization')
      if (!EventManagementSystem.activeReservation(existing.status)) throw new SystemError('ROOM_UNAVAILABLE', 'Completed or cancelled reservations cannot be rescheduled')
      const candidate = { ...existing, ...updates }
      EventManagementSystem.parseRange(candidate.startsAt, candidate.endsAt)
      await this.assertRoomForReservation(candidate)
      const conflict = await this.findConflict(candidate, id)
      if (conflict) throw new SystemError('RESERVATION_CONFLICT', 'The room is already reserved for this interval', { conflict })
      return await this.db.update('events', { id }, { ...updates, date: candidate.startsAt }) as LectureReservation
    })
  }

  async updateReservation(id: string, organizationId: string, updates: {
    name?: string; description?: string; teacherId?: string; capacity?: number; timezone?: string; academicPath?: ScheduleLectureOptions['academicPath']
  }): Promise<LectureReservation> {
    const existing = await this.db.findOne('events', { id }) as LectureReservation | null
    if (!existing) throw new SystemError('EVENT_NOT_FOUND', `Reservation ${id} not found`)
    if (existing.organizationId !== organizationId) throw new SystemError('ORGANIZATION_MISMATCH', 'Reservation belongs to another organization')
    if (!EventManagementSystem.activeReservation(existing.status)) throw new SystemError('ROOM_UNAVAILABLE', 'Completed or cancelled reservations cannot be updated')
    if (updates.name !== undefined && (updates.name.trim().length < 3 || updates.name.length > 100)) {
      throw new SystemError('EVENT_VALIDATION_FAILED', 'Reservation name must contain between 3 and 100 characters')
    }
    if (updates.capacity !== undefined) await this.assertRoomForReservation({ ...existing, capacity: updates.capacity })
    EventManagementSystem.validateAcademicPath(updates.academicPath)
    return await this.db.update('events', { id }, { ...updates, metadata: {
      ...existing.metadata, lastModified: new Date().toISOString(),
    } }) as LectureReservation
  }


  async recordAttendanceEvent(options: RecordAttendanceEventOptions): Promise<AttendanceEvent> {
    await this.requireReservation(options.reservationId, options.organizationId)
    EventManagementSystem.validateParticipantRef(options)
    EventManagementSystem.validateAttendanceEventType(options.type)
    const occurredAt = EventManagementSystem.parseOptionalInstant(options.occurredAt, 'occurredAt')
    const event: AttendanceEvent = {
      id: `attendance_${randomUUID()}`,
      organizationId: options.organizationId,
      reservationId: options.reservationId,
      type: options.type,
      userId: options.userId,
      role: options.role,
      occurredAt,
      capturedBy: options.capturedBy,
      metadata: options.metadata,
    }
    await this.db.insert('attendance', event)
    return event
  }

  async captureAttendanceSnapshot(options: CaptureAttendanceSnapshotOptions): Promise<AttendanceSnapshot> {
    const reservation = await this.requireReservation(options.reservationId, options.organizationId)
    if (reservation.status === 'cancelled') throw new SystemError('ROOM_UNAVAILABLE', 'Cancelled reservations cannot capture attendance')
    if (options.capturedBy.trim().length === 0) throw new SystemError('EVENT_VALIDATION_FAILED', 'capturedBy is required')
    const seen = new Set<string>()
    const participants = options.participants.map(participant => {
      EventManagementSystem.validateParticipantRef(participant)
      if (seen.has(participant.userId)) throw new SystemError('EVENT_VALIDATION_FAILED', 'Attendance snapshot participants must be unique')
      seen.add(participant.userId)
      return participant
    })
    const capturedAt = EventManagementSystem.parseOptionalInstant(options.capturedAt, 'capturedAt')
    const snapshot: AttendanceSnapshot = {
      id: `attendance_snapshot_${randomUUID()}`,
      organizationId: options.organizationId,
      reservationId: options.reservationId,
      capturedBy: options.capturedBy,
      capturedAt,
      participants,
    }
    await this.db.insert('attendance_snapshots', snapshot)
    for (const participant of participants) {
      await this.recordAttendanceEvent({
        organizationId: options.organizationId,
        reservationId: options.reservationId,
        type: 'snapshot',
        userId: participant.userId,
        role: participant.role,
        occurredAt: capturedAt,
        capturedBy: options.capturedBy,
        metadata: { snapshotId: snapshot.id, displayName: participant.displayName },
      })
    }
    return snapshot
  }

  async finalizeAttendanceReport(organizationId: string, reservationId: string): Promise<AttendanceReport> {
    const reservation = await this.requireReservation(reservationId, organizationId)
    if (reservation.status !== 'completed') throw new SystemError('ROOM_UNAVAILABLE', 'Attendance reports can only be finalized for completed reservations')
    const existing = await this.db.findOne('attendance_reports', { organizationId, reservationId }) as AttendanceReport | null
    if (existing) return existing
    const events = await this.db.find('attendance', { organizationId, reservationId }) as AttendanceEvent[]
    const byUser = new Map<string, AttendanceReportParticipant>()
    for (const event of events.sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))) {
      const current = byUser.get(event.userId)
      if (!current) {
        byUser.set(event.userId, { userId: event.userId, role: event.role, firstSeenAt: event.occurredAt,
          lastSeenAt: event.occurredAt, eventCount: 1, snapshotCount: event.type === 'snapshot' ? 1 : 0 })
      } else {
        current.lastSeenAt = event.occurredAt
        current.eventCount += 1
        if (event.type === 'snapshot') current.snapshotCount += 1
      }
    }
    const participants = [...byUser.values()]
    const report: AttendanceReport = {
      id: `attendance_report_${randomUUID()}`,
      organizationId,
      reservationId,
      finalizedAt: new Date().toISOString(),
      lectureStartsAt: reservation.startsAt,
      lectureEndsAt: reservation.endsAt,
      participants,
      totals: {
        participants: participants.length,
        students: participants.filter(item => item.role === 'student').length,
        teachers: participants.filter(item => item.role === 'teacher').length,
        admins: participants.filter(item => item.role === 'admin').length,
        events: events.length,
        snapshots: events.filter(item => item.type === 'snapshot').length,
      },
    }
    await this.db.insert('attendance_reports', report)
    return report
  }

  async getAttendanceReport(organizationId: string, reservationId: string): Promise<AttendanceReport | null> {
    await this.requireReservation(reservationId, organizationId)
    return await this.db.findOne('attendance_reports', { organizationId, reservationId }) as AttendanceReport | null
  }

  async cancelReservation(id: string, organizationId: string, reason?: string): Promise<LectureReservation> {
    const existing = await this.db.findOne('events', { id }) as LectureReservation | null
    if (!existing) throw new SystemError('EVENT_NOT_FOUND', `Reservation ${id} not found`)
    if (existing.organizationId !== organizationId) throw new SystemError('ORGANIZATION_MISMATCH', 'Reservation belongs to another organization')
    if (!EventManagementSystem.activeReservation(existing.status)) throw new SystemError('ROOM_UNAVAILABLE', 'Reservation is already final')
    return await this.db.update('events', { id }, { status: 'cancelled', metadata: {
      ...existing.metadata, cancelledAt: new Date().toISOString(), cancellationReason: reason,
    } }) as LectureReservation
  }

  async getRoomAvailability(options: { organizationId: string; startsAt: string; endsAt: string; capacity?: number; excludeReservationId?: string }): Promise<any[]> {
    EventManagementSystem.parseRange(options.startsAt, options.endsAt)
    const rooms = await this.db.find('rooms', { organizationId: options.organizationId })
    const available = []
    for (const room of rooms) {
      if (room.status === 'maintenance' || (options.capacity !== undefined && room.capacity < options.capacity)) continue
      if (!await this.findConflict({ ...options, roomId: room.id }, options.excludeReservationId)) available.push(room)
    }
    return available
  }

  constructor(private config?: EventConfig, persistence?: PersistenceAdapter) {
    // Use singleton instance of JsonDatabase
    this.db = persistence ?? JsonDatabase.getInstance()
    this.roomTurnoverMs = config?.roomTurnoverMs ?? 15 * 60_000
    if (this.roomTurnoverMs < 0) throw new SystemError('EVENT_VALIDATION_FAILED', 'roomTurnoverMs cannot be negative')
  }

  /**
   * Set the communication system instance
   * This is needed to call clearRoom when lecture ends
   */
  setCommsSystem(commsSystem: RealTimeCommunicationSystem): void {
    this.commsSystem = commsSystem
  }

  async createEvent(options: EventOptions & { teacherId: string; createdBy: string }): Promise<Lecture> {
    try {
      // Log the incoming data
      console.log('Creating event with options:', options)

      const validationResult = CreateLectureSchema.safeParse(options)
      if (!validationResult.success) {
        console.error('Validation error:', validationResult.error.flatten())
        throw new SystemError('EVENT_VALIDATION_FAILED', 'Invalid lecture data', validationResult.error.flatten())
      }

      // Create the lecture event
      const event: Lecture = {
        id: `lecture_${randomUUID()}`,
        name: validationResult.data.name,
        date: validationResult.data.date,
        roomId: validationResult.data.roomId,
        type: 'lecture',
        status: 'scheduled',
        teacherId: options.teacherId,
        createdBy: options.createdBy,
        description: validationResult.data.description,
        maxParticipants: validationResult.data.maxParticipants,
      }

      // Log the event before insertion
      console.log('Event to be inserted:', event)

      // Save the event to the database
      await this.db.insert('events', event)
      
      // Update the room to associate it with this lecture
      const room = await this.db.findOne('rooms', { id: event.roomId })
      if (room) {
        // Update the room with the current lecture info
        await this.db.update('rooms', { id: event.roomId }, {
          currentLecture: {
            id: event.id,
            name: event.name,
            teacherId: event.teacherId,
            status: event.status
          },
          status: 'scheduled',
          updatedAt: new Date().toISOString()
        })
        console.log(`Room ${event.roomId} updated with lecture ${event.id}`)
      } else {
        console.warn(`Room ${event.roomId} not found, unable to associate with lecture`)
      }
      
      return event
    } catch (error) {
      // Log the full error
      console.error('Event creation error:', error)
      if (error instanceof SystemError) throw error
      throw new SystemError('EVENT_CREATION_FAILED', 'Failed to create event', error)
    }
  }

  async cancelEvent(eventId: string): Promise<void> {
    try {
      const event = await this.getEvent(eventId)
      const updated = await this.db.update('events', { id: eventId }, { status: 'cancelled' })

      if (!updated) {
        throw new SystemError('EVENT_NOT_FOUND', `Event ${eventId} not found`)
      }

      // Update the room if this lecture was associated with it
      const room = await this.db.findOne('rooms', { id: event.roomId })
      if (room && room.currentLecture?.id === eventId) {
        await this.db.update('rooms', { id: event.roomId }, {
          status: 'available',
          currentLecture: undefined,
          updatedAt: new Date().toISOString()
        })
        console.log(`Room ${event.roomId} status updated after lecture cancellation`)

        // v1.1.3: Clear room ephemeral data when lecture is cancelled
        if (this.commsSystem) {
          this.commsSystem.clearRoom(event.roomId)
        }
      }
    } catch (error) {
      throw new SystemError('EVENT_CANCELLATION_FAILED', 'Failed to cancel event', error)
    }
  }

  async getEvent(eventId: string): Promise<Lecture> {
    try {
      const event = await this.db.findOne('events', { id: eventId })

      if (!event) {
        throw new SystemError('EVENT_NOT_FOUND', `Event ${eventId} not found`)
      }

      return event
    } catch (error) {
      throw new SystemError('EVENT_FETCH_FAILED', 'Failed to fetch event', error)
    }
  }

  async listEvents(filter: { type: string; roomId?: string; teacherId?: string; status?: string }): Promise<Lecture[]> {
    try {
      const query: Record<string, any> = { type: filter.type }
      if (filter.roomId !== undefined) query.roomId = filter.roomId
      if (filter.teacherId !== undefined) query.teacherId = filter.teacherId
      if (filter.status !== undefined) query.status = filter.status

      return await this.db.find('events', query)
    } catch (error) {
      throw new SystemError('EVENT_LIST_FAILED', 'Failed to list events', error)
    }
  }

  async updateEvent(eventId: string, updates: Partial<Lecture>): Promise<Lecture> {
    try {
      // Validate updates
      const validationResult = UpdateLectureSchema.safeParse(updates)
      if (!validationResult.success) {
        throw new SystemError(
          'EVENT_VALIDATION_FAILED',
          'Invalid lecture update data',
          validationResult.error.flatten()
        )
      }

      const updated = await this.db.update('events', { id: eventId }, validationResult.data)
      if (!updated) {
        throw new SystemError('EVENT_NOT_FOUND', `Event ${eventId} not found`)
      }

      return updated
    } catch (error) {
      if (error instanceof SystemError) throw error
      throw new SystemError('EVENT_UPDATE_FAILED', 'Failed to update event', error)
    }
  }

  async updateEventStatus(eventId: string, newStatus: Lecture['status']): Promise<Lecture> {
    try {
      const event = (await this.db.findOne('events', { id: eventId })) as Lecture
      if (!event) {
        throw new SystemError('EVENT_NOT_FOUND', `Event ${eventId} not found`)
      }

      const allowedTransitions: Record<Lecture['status'], Lecture['status'][]> = {
        scheduled: ['in-progress', 'cancelled', 'delayed'],
        delayed: ['in-progress', 'cancelled'],
        'in-progress': ['completed', 'cancelled'],
        completed: [], // Final state
        cancelled: [], // Final state
      }

      if (!allowedTransitions[event.status]?.includes(newStatus)) {
        throw new SystemError(
          'INVALID_STATUS_TRANSITION' as ErrorCode,
          `Cannot transition from ${event.status} to ${newStatus}`
        )
      }

      const updates: Partial<Lecture> = {
        status: newStatus,
        ...(newStatus === 'in-progress' && { startTime: new Date().toISOString() }),
        ...(newStatus === 'completed' && { endTime: new Date().toISOString() }),
      }

      const updated = await this.db.update('events', { id: eventId }, updates)
      if (!updated) {
        throw new SystemError('EVENT_UPDATE_FAILED', 'Failed to update event status')
      }
      
      // Update the room status based on the lecture status
      const room = await this.db.findOne('rooms', { id: event.roomId })
      if (room && room.currentLecture?.id === eventId) {
        let roomStatus = room.status
        if (newStatus === 'in-progress') {
          roomStatus = 'occupied'
        } else if (newStatus === 'completed' || newStatus === 'cancelled') {
          roomStatus = 'available'
        }

        // Update room status and lecture reference
        await this.db.update('rooms', { id: event.roomId }, {
          status: roomStatus,
          currentLecture: newStatus === 'completed' || newStatus === 'cancelled'
            ? undefined
            : { ...room.currentLecture, status: newStatus },
          updatedAt: new Date().toISOString()
        })

        console.log(`Room ${event.roomId} status updated to ${roomStatus} after lecture status change to ${newStatus}`)

      }

      // v1.4.6: Update comms system with lecture status and room availability.
      // Reservation-backed and migrated lecture records may not be mirrored in
      // room.currentLecture, so realtime admission must follow the lecture
      // transition itself rather than the room denormalization path above.
      if (this.commsSystem) {
        if (newStatus === 'in-progress') {
          // Register lecture when it becomes active
          this.commsSystem.registerLecture(eventId, event.roomId, newStatus)
        } else if (newStatus === 'completed' || newStatus === 'cancelled') {
          // v1.1.3: Clear room ephemeral data when lecture ends
          this.commsSystem.clearRoom(event.roomId)
          // v1.4.6: Unregister lecture to prevent re-entry
          this.commsSystem.unregisterLecture(eventId)
        } else {
          // Update lecture status for other transitions
          this.commsSystem.updateLectureStatus(eventId, newStatus)
        }
      }

      return updated
    } catch (error) {
      if (error instanceof SystemError) throw error
      throw new SystemError('EVENT_UPDATE_FAILED', 'Failed to update event status', error)
    }
  }
}
