import { SystemError, ErrorCode } from '../../interfaces/errors.interface'
import { EventConfig, Lecture, EventOptions } from '../../interfaces'
import { CreateLectureSchema, UpdateLectureSchema } from '../../interfaces/schema'
import { JsonDatabase } from '../../utils/JsonDatabase'
import { RealTimeCommunicationSystem } from '../comms/RealTimeCommunicationSystem'

export class EventManagementSystem {
  private db: JsonDatabase
  private commsSystem: RealTimeCommunicationSystem | null = null

  constructor(private config?: EventConfig) {
    // Use singleton instance of JsonDatabase
    this.db = JsonDatabase.getInstance()
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
        id: `lecture_${Date.now()}`,
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

        // v1.1.3: Clear room ephemeral data when lecture ends (completed or cancelled)
        if ((newStatus === 'completed' || newStatus === 'cancelled') && this.commsSystem) {
          this.commsSystem.clearRoom(event.roomId)
        }
      }

      return updated
    } catch (error) {
      if (error instanceof SystemError) throw error
      throw new SystemError('EVENT_UPDATE_FAILED', 'Failed to update event status', error)
    }
  }
}
