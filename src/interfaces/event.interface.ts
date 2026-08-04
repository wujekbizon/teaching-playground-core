export interface EventConfig {
  timezone?: string
  earlyAdmissionMs?: number
  completionGraceMs?: number
  schedulerIntervalMs?: number
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

export interface LectureReservation extends Omit<Lecture, 'status'> {
  organizationId: string
  startsAt: string
  endsAt: string
  timezone: string
  capacity: number
  status: ReservationStatus
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
}

export interface ReservationFilter {
  organizationId: string
  roomId?: string
  teacherId?: string
  status?: ReservationStatus
  from?: string
  to?: string
}
