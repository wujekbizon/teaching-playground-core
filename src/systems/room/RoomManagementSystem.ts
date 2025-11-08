import { SystemError, RoomConfig } from '../../interfaces'
import { Room, CreateRoomOptions, RoomState, RoomParticipant } from '../../interfaces/room.interface'
import { JsonDatabase } from '../../utils/JsonDatabase'
import { User } from '../../interfaces/user.interface'
import { Lecture } from '../../interfaces/event.interface'
import { RealTimeCommunicationSystem } from '../comms/RealTimeCommunicationSystem'

export class RoomManagementSystem {
  private db: JsonDatabase
  private commsSystem: RealTimeCommunicationSystem

  constructor(private config?: RoomConfig) {
    // Use singleton instance of JsonDatabase
    this.db = JsonDatabase.getInstance()
    this.commsSystem = new RealTimeCommunicationSystem()
    console.log('RoomManagementSystem initialized with singleton database instance')
  }

  public getCommsSystem(): RealTimeCommunicationSystem {
    return this.commsSystem;
  }

  async createRoom(options: CreateRoomOptions): Promise<Room> {
    try {
      const room: Room = {
        id: `room_${Date.now()}`,
        name: options.name,
        capacity: options.capacity,
        status: 'available',
        features: {
          hasVideo: options.features?.hasVideo ?? true,
          hasAudio: options.features?.hasAudio ?? true,
          hasChat: options.features?.hasChat ?? true,
          hasWhiteboard: options.features?.hasWhiteboard ?? false,
          hasScreenShare: options.features?.hasScreenShare ?? true,
        },
        // NOTE: participants are NOT stored in database
        // They only exist in RealTimeCommunicationSystem memory
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await this.db.insert('rooms', room)
      // Setup communication for the new room
      this.commsSystem.setupForRoom(room.id)
      return room
    } catch (error) {
      throw new SystemError('ROOM_CREATION_FAILED', 'Failed to create room', error)
    }
  }

  async assignLectureToRoom(roomId: string, lecture: Lecture): Promise<Room> {
    try {
      const room = await this.getRoom(roomId)
      
      // Update room with lecture and change status
      const updatedRoom = await this.updateRoom(roomId, {
        currentLecture: {
          id: lecture.id,
          name: lecture.name,
          teacherId: lecture.teacherId,
          status: lecture.status
        },
        status: 'scheduled'
      })

      // Allocate communication resources for the lecture
      this.commsSystem.allocateResources(lecture.id)
      
      return updatedRoom
    } catch (error) {
      throw new SystemError('LECTURE_ASSIGNMENT_FAILED', 'Failed to assign lecture to room', error)
    }
  }

  async startLecture(roomId: string): Promise<Room> {
    try {
      const room = await this.getRoom(roomId)
      
      if (!room.currentLecture) {
        throw new SystemError('NO_LECTURE_SCHEDULED', 'No lecture scheduled for this room')
      }

      // Update room and lecture status
      const updatedRoom = await this.updateRoom(roomId, {
        status: 'occupied',
        currentLecture: {
          ...room.currentLecture,
          status: 'in-progress'
        }
      })

      return updatedRoom
    } catch (error) {
      throw new SystemError('LECTURE_START_FAILED', 'Failed to start lecture', error)
    }
  }

  async endLecture(roomId: string): Promise<Room> {
    try {
      const room = await this.getRoom(roomId)

      if (!room.currentLecture) {
        throw new SystemError('NO_LECTURE_ACTIVE', 'No active lecture in this room')
      }

      // Deallocate communication resources (this will clear participants from memory)
      await this.commsSystem.deallocateResources(room.currentLecture.id)

      // Clear the current lecture and reset room status
      // NOTE: participants are NOT in database, so no need to clear them
      const updatedRoom = await this.updateRoom(roomId, {
        status: 'available',
        currentLecture: null
      })

      return updatedRoom
    } catch (error) {
      throw new SystemError('LECTURE_END_FAILED', 'Failed to end lecture', error)
    }
  }

  async getRoom(roomId: string): Promise<Room> {
    try {
      const room = await this.db.findOne('rooms', { id: roomId })
      if (!room) {
        throw new SystemError('ROOM_NOT_FOUND', `Room ${roomId} not found`)
      }
      return room
    } catch (error) {
      throw new SystemError('ROOM_FETCH_FAILED', 'Failed to fetch room', error)
    }
  }

  async listRooms(filter?: { status?: Room['status'] }): Promise<Room[]> {
    try {
      return await this.db.find('rooms', filter || {})
    } catch (error) {
      throw new SystemError('ROOM_LIST_FAILED', 'Failed to list rooms', error)
    }
  }

  async updateRoom(roomId: string, updates: Partial<Room>): Promise<Room> {
    try {
      const room = await this.getRoom(roomId)
      const updatedRoom = {
        ...room,
        ...updates,
        updatedAt: new Date().toISOString(),
      }
      await this.db.update('rooms', { id: roomId }, updatedRoom)
      return updatedRoom
    } catch (error) {
      throw new SystemError('ROOM_UPDATE_FAILED', 'Failed to update room', error)
    }
  }

  /**
   * Get active participants in a room from WebSocket memory (not database)
   * NOTE: Participants are only stored in RealTimeCommunicationSystem memory
   * This method queries the in-memory participant list
   */
  async getRoomParticipants(roomId: string): Promise<RoomParticipant[]> {
    try {
      // Participants are stored in memory only, get from comms system
      return this.commsSystem.getRoomParticipants(roomId)
    } catch (error) {
      throw new SystemError('PARTICIPANTS_FETCH_FAILED', 'Failed to fetch participants', error)
    }
  }

  /**
   * @deprecated Use WebSocket 'join_room' event instead
   * Participants are managed through WebSocket connections only
   */
  async addParticipant(roomId: string, user: User): Promise<RoomParticipant> {
    console.warn('addParticipant is deprecated. Use WebSocket join_room event instead.')
    throw new SystemError('METHOD_DEPRECATED', 'Use WebSocket join_room event to add participants')
  }

  /**
   * @deprecated Use WebSocket 'leave_room' event instead
   * Participants are managed through WebSocket connections only
   */
  async removeParticipant(roomId: string, userId: string): Promise<void> {
    console.warn('removeParticipant is deprecated. Use WebSocket leave_room event instead.')
    throw new SystemError('METHOD_DEPRECATED', 'Use WebSocket leave_room event to remove participants')
  }

  /**
   * @deprecated Streaming status is managed automatically through WebSocket events
   */
  async updateParticipantStreamingStatus(roomId: string, userId: string, isStreaming: boolean): Promise<Room> {
    console.warn('updateParticipantStreamingStatus is deprecated. Streaming status is managed through WebSocket events.')
    throw new SystemError('METHOD_DEPRECATED', 'Streaming status is managed through WebSocket events')
  }

  /**
   * @deprecated Participants are cleared automatically when WebSocket disconnects
   */
  async clearParticipants(roomId: string): Promise<void> {
    console.warn('clearParticipants is deprecated. Participants are cleared automatically on disconnect.')
    throw new SystemError('METHOD_DEPRECATED', 'Participants are cleared automatically on disconnect')
  }

  async getRoomState(roomId: string): Promise<RoomState> {
    try {
      const room = await this.getRoom(roomId)
      const commsStatus = room.currentLecture ?
        await this.commsSystem.getResourceStatus(room.currentLecture.id) :
        undefined

      // Get participant count from memory (WebSocket) not database
      const participants = this.commsSystem.getRoomParticipants(roomId)

      const state: RoomState = {
        isStreamActive: room.status === 'occupied',
        isChatActive: room.features.hasChat && room.status === 'occupied',
        activeFeatures: Object.entries(room.features)
          .filter(([_, enabled]) => enabled)
          .map(([feature]) => feature),
        participantCount: participants.length
      }

      if (commsStatus) {
        state.communicationStatus = commsStatus
      }

      return state
    } catch (error) {
      throw new SystemError('ROOM_STATE_FETCH_FAILED', 'Failed to fetch room state', error)
    }
  }

  async createTestRoom(): Promise<Room> {
    const room: Room = {
      id: 'test-room-1',
      name: 'Test Room',
      capacity: 20,
      status: 'available',
      features: {
        hasVideo: true,
        hasAudio: true,
        hasChat: true,
        hasWhiteboard: true,
        hasScreenShare: true,
      },
      // NOTE: participants are NOT stored in database
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }

    await this.db.insert('rooms', room)
    return room
  }

  // Method to get available rooms for new lectures
  async getAvailableRooms(): Promise<Room[]> {
    try {
      return await this.db.find('rooms', { status: 'available' })
    } catch (error) {
      throw new SystemError('ROOM_FETCH_FAILED', 'Failed to fetch available rooms', error)
    }
  }
}
