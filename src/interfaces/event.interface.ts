export interface EventConfig {
  timezone?: string
  earlyAdmissionMs?: number
  completionGraceMs?: number
  schedulerIntervalMs?: number
  /** Minimum empty-room turnover gap required between consecutive lectures. */
  roomTurnoverMs?: number
  [key: string]: any
}

export interface EventOptions {
  name: string
  date: string
  roomId: string
}

export interface Lecture {
  id: string
  /** Present on reservation-backed lectures created with the v2 scheduling API. */
  organizationId?: string
  name: string
  date: string
  roomId: string
  type: 'lecture'
  status: 'scheduled' | 'in-progress' | 'completed' | 'cancelled' | 'delayed'
  teacherId: string
  createdBy: string

  // Optional fields with explicit undefined
  description?: string | undefined
  maxParticipants?: number | undefined
  communicationStatus?:
    | {
        websocket: boolean
        webrtc: boolean
        resources: {
          allocated: boolean
          type: string
        }
      }
    | undefined
  // NOTE: participants are NOT stored in database
  // They only exist in RealTimeCommunicationSystem memory (WebSocket)
  metadata?:
    | {
        createdAt: string
        lastModified: string
        cancelledAt?: string
        cancelledBy?: string
        cancellationReason?: string
      }
    | undefined
  startTime?: string | undefined
  endTime?: string | undefined
  scheduledDuration?: number | undefined
  startsAt?: string
  endsAt?: string
  timezone?: string
  capacity?: number
}

export type ReservationStatus = 'scheduled' | 'open' | 'in-progress' | 'completed' | 'cancelled'

export interface ExternalReference {
  provider: string
  type: string
  id: string
  url?: string
  metadata?: Record<string, unknown>
}

export interface AcademicEntity {
  id: string
  organizationId: string
  name: string
  externalRef?: ExternalReference
}

export interface Organization extends Omit<AcademicEntity, 'organizationId'> {
  timezone?: string
}

export interface AcademicProgram extends AcademicEntity {}

export interface Curriculum extends AcademicEntity {
  programId: string
  version?: string
}

export interface AcademicTerm extends AcademicEntity {
  programId: string
  curriculumId: string
  startsAt: string
  endsAt: string
  timezone: string
}

export interface Course extends AcademicEntity {
  programId: string
  curriculumId: string
}

export interface Subject extends AcademicEntity {
  programId: string
  curriculumId: string
  courseId: string
}

export interface Cohort extends AcademicEntity {
  programId: string
  curriculumId: string
  termId: string
  courseId: string
}

export interface ReservationAcademicPath {
  programId: string
  curriculumId: string
  termId: string
  courseId: string
  subjectId: string
  cohortId: string
  externalRef?: ExternalReference
}

export interface LectureReservation extends Omit<Lecture, 'status'> {
  organizationId: string
  startsAt: string
  endsAt: string
  timezone: string
  capacity: number
  status: ReservationStatus
  academicPath?: ReservationAcademicPath
}


export type AttendanceEventType = 'joined' | 'left' | 'present' | 'snapshot'

export interface AttendanceParticipantRef {
  userId: string
  role: 'teacher' | 'student' | 'admin'
  displayName?: string
}

export interface AttendanceEvent {
  id: string
  organizationId: string
  reservationId: string
  type: AttendanceEventType
  userId: string
  role: AttendanceParticipantRef['role']
  occurredAt: string
  capturedBy?: string
  metadata?: Record<string, unknown>
}

export interface AttendanceSnapshot {
  id: string
  organizationId: string
  reservationId: string
  capturedBy: string
  capturedAt: string
  participants: AttendanceParticipantRef[]
}

export interface AttendanceReportParticipant {
  userId: string
  role: AttendanceParticipantRef['role']
  firstSeenAt: string
  lastSeenAt: string
  eventCount: number
  snapshotCount: number
}

export interface AttendanceReport {
  id: string
  organizationId: string
  reservationId: string
  finalizedAt: string
  lectureStartsAt: string
  lectureEndsAt: string
  participants: AttendanceReportParticipant[]
  totals: {
    participants: number
    students: number
    teachers: number
    admins: number
    events: number
    snapshots: number
  }
}

export interface RecordAttendanceEventOptions {
  organizationId: string
  reservationId: string
  type: AttendanceEventType
  userId: string
  role: AttendanceParticipantRef['role']
  occurredAt?: string
  capturedBy?: string
  metadata?: Record<string, unknown>
}

export interface CaptureAttendanceSnapshotOptions {
  organizationId: string
  reservationId: string
  capturedBy: string
  capturedAt?: string
  participants: AttendanceParticipantRef[]
}

export interface ScheduleLectureOptions {
  organizationId: string
  roomId: string
  name: string
  teacherId: string
  createdBy: string
  startsAt: string
  endsAt: string
  timezone: string
  capacity: number
  description?: string
  academicPath?: ReservationAcademicPath
}

export interface ReservationFilter {
  organizationId: string
  roomId?: string
  teacherId?: string
  status?: ReservationStatus
  from?: string
  to?: string
  programId?: string
  curriculumId?: string
  termId?: string
  courseId?: string
  subjectId?: string
  cohortId?: string
}
