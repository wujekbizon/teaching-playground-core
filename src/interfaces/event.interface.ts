export interface EventConfig {
  timezone?: string
  [key: string]: any
}

export interface EventOptions {
  name: string
  date: string
  roomId: string
}

export interface Lecture {
  id: string
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
}
