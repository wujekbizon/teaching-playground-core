/**
 * Tests for EventManagementSystem room cleanup integration (v1.1.3)
 * Tests automatic clearRoom calls when lectures end
 */

import { EventManagementSystem } from '../systems/event/EventManagementSystem'
import { RealTimeCommunicationSystem } from '../systems/comms/RealTimeCommunicationSystem'
import { JsonDatabase } from '../utils/JsonDatabase'
import { Lecture } from '../interfaces/event.interface'

// Create mock database instance factory
const createMockDb = () => ({
  insert: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  update: jest.fn(),
  delete: jest.fn()
})

let mockDbInstance = createMockDb()

// Mock JsonDatabase
jest.mock('../utils/JsonDatabase', () => {
  return {
    JsonDatabase: {
      getInstance: jest.fn(() => mockDbInstance)
    }
  }
})

describe('EventManagementSystem - Room Cleanup Integration (v1.1.3)', () => {
  let eventSystem: EventManagementSystem
  let mockCommsSystem: jest.Mocked<RealTimeCommunicationSystem>
  let mockDb: any

  beforeEach(() => {
    // Create fresh mock instance
    mockDbInstance = createMockDb()

    // Update the getInstance mock to return the new instance
    ;(JsonDatabase.getInstance as jest.Mock).mockReturnValue(mockDbInstance)

    // Create mock comms system
    mockCommsSystem = {
      clearRoom: jest.fn(),
      getRoomParticipants: jest.fn(),
      setupForRoom: jest.fn(),
      allocateResources: jest.fn(),
      deallocateResources: jest.fn()
    } as any

    eventSystem = new EventManagementSystem()
    eventSystem.setCommsSystem(mockCommsSystem)

    mockDb = mockDbInstance
  })

  describe('setCommsSystem', () => {
    it('should set the communication system instance', () => {
      const newEventSystem = new EventManagementSystem()
      newEventSystem.setCommsSystem(mockCommsSystem)

      expect((newEventSystem as any).commsSystem).toBe(mockCommsSystem)
    })

    it('should allow null commsSystem initially', () => {
      const newEventSystem = new EventManagementSystem()
      expect((newEventSystem as any).commsSystem).toBeNull()
    })
  })

  describe('cancelEvent', () => {
    it('should call clearRoom when lecture is cancelled', async () => {
      const mockEvent: Lecture = {
        id: 'lecture-123',
        name: 'Test Lecture',
        date: new Date().toISOString(),
        roomId: 'room-123',
        type: 'lecture',
        status: 'scheduled',
        teacherId: 'teacher-1',
        createdBy: 'teacher-1',
        description: 'Test',
        maxParticipants: 20
      }

      const mockRoom = {
        id: 'room-123',
        name: 'Test Room',
        status: 'scheduled',
        currentLecture: {
          id: 'lecture-123',
          name: 'Test Lecture',
          teacherId: 'teacher-1',
          status: 'scheduled'
        }
      }

      const updatedEvent = { ...mockEvent, status: 'cancelled' as const }
      const updatedRoom = {
        ...mockRoom,
        status: 'available',
        currentLecture: undefined
      }

      mockDb.findOne.mockResolvedValueOnce(mockEvent).mockResolvedValueOnce(mockRoom)
      mockDb.update.mockResolvedValueOnce(updatedEvent).mockResolvedValueOnce(updatedRoom)

      await eventSystem.cancelEvent('lecture-123')

      // Verify clearRoom was called
      expect(mockCommsSystem.clearRoom).toHaveBeenCalledWith('room-123')
    })

    it('should not call clearRoom if commsSystem is not set', async () => {
      const newEventSystem = new EventManagementSystem()
      // Don't set commsSystem

      const mockEvent: Lecture = {
        id: 'lecture-123',
        name: 'Test Lecture',
        date: new Date().toISOString(),
        roomId: 'room-123',
        type: 'lecture',
        status: 'scheduled',
        teacherId: 'teacher-1',
        createdBy: 'teacher-1',
        description: 'Test',
        maxParticipants: 20
      }

      const mockRoom = {
        id: 'room-123',
        name: 'Test Room',
        status: 'scheduled',
        currentLecture: {
          id: 'lecture-123',
          name: 'Test Lecture',
          teacherId: 'teacher-1',
          status: 'scheduled'
        }
      }

      const updatedEvent = { ...mockEvent, status: 'cancelled' as const }
      const updatedRoom = { ...mockRoom, status: 'available', currentLecture: undefined }

      mockDb.findOne.mockResolvedValueOnce(mockEvent).mockResolvedValueOnce(mockRoom)
      mockDb.update.mockResolvedValueOnce(updatedEvent).mockResolvedValueOnce(updatedRoom)

      await newEventSystem.cancelEvent('lecture-123')

      // clearRoom should not be called since commsSystem is null
      expect(mockCommsSystem.clearRoom).not.toHaveBeenCalled()
    })

    it('should not call clearRoom if room has different lecture', async () => {
      const mockEvent: Lecture = {
        id: 'lecture-123',
        name: 'Test Lecture',
        date: new Date().toISOString(),
        roomId: 'room-123',
        type: 'lecture',
        status: 'scheduled',
        teacherId: 'teacher-1',
        createdBy: 'teacher-1',
        description: 'Test',
        maxParticipants: 20
      }

      const mockRoom = {
        id: 'room-123',
        name: 'Test Room',
        status: 'scheduled',
        currentLecture: {
          id: 'different-lecture',  // Different lecture
          name: 'Different Lecture',
          teacherId: 'teacher-1',
          status: 'scheduled'
        }
      }

      const updatedEvent = { ...mockEvent, status: 'cancelled' as const }

      mockDb.findOne.mockResolvedValueOnce(mockEvent).mockResolvedValueOnce(mockRoom)
      mockDb.update.mockResolvedValue(updatedEvent)

      await eventSystem.cancelEvent('lecture-123')

      // clearRoom should not be called
      expect(mockCommsSystem.clearRoom).not.toHaveBeenCalled()
    })
  })

  describe('updateEventStatus', () => {
    it('should call clearRoom when lecture status changes to completed', async () => {
      const mockEvent: Lecture = {
        id: 'lecture-123',
        name: 'Test Lecture',
        date: new Date().toISOString(),
        roomId: 'room-123',
        type: 'lecture',
        status: 'in-progress',
        teacherId: 'teacher-1',
        createdBy: 'teacher-1',
        description: 'Test',
        maxParticipants: 20
      }

      const mockRoom = {
        id: 'room-123',
        name: 'Test Room',
        status: 'occupied',
        currentLecture: {
          id: 'lecture-123',
          name: 'Test Lecture',
          teacherId: 'teacher-1',
          status: 'in-progress'
        }
      }

      const updatedEvent = { ...mockEvent, status: 'completed' as const, endTime: expect.any(String) }
      const updatedRoom = { ...mockRoom, status: 'available', currentLecture: undefined }

      mockDb.findOne.mockResolvedValueOnce(mockEvent).mockResolvedValueOnce(mockRoom)
      mockDb.update.mockResolvedValueOnce(updatedEvent).mockResolvedValueOnce(updatedRoom)

      await eventSystem.updateEventStatus('lecture-123', 'completed')

      // Verify clearRoom was called
      expect(mockCommsSystem.clearRoom).toHaveBeenCalledWith('room-123')
    })

    it('should call clearRoom when lecture status changes to cancelled', async () => {
      const mockEvent: Lecture = {
        id: 'lecture-123',
        name: 'Test Lecture',
        date: new Date().toISOString(),
        roomId: 'room-123',
        type: 'lecture',
        status: 'in-progress',
        teacherId: 'teacher-1',
        createdBy: 'teacher-1',
        description: 'Test',
        maxParticipants: 20
      }

      const mockRoom = {
        id: 'room-123',
        name: 'Test Room',
        status: 'occupied',
        currentLecture: {
          id: 'lecture-123',
          name: 'Test Lecture',
          teacherId: 'teacher-1',
          status: 'in-progress'
        }
      }

      const updatedEvent = { ...mockEvent, status: 'cancelled' as const }
      const updatedRoom = { ...mockRoom, status: 'available', currentLecture: undefined }

      mockDb.findOne.mockResolvedValueOnce(mockEvent).mockResolvedValueOnce(mockRoom)
      mockDb.update.mockResolvedValueOnce(updatedEvent).mockResolvedValueOnce(updatedRoom)

      await eventSystem.updateEventStatus('lecture-123', 'cancelled')

      // Verify clearRoom was called
      expect(mockCommsSystem.clearRoom).toHaveBeenCalledWith('room-123')
    })

    it('should not call clearRoom when lecture status changes to in-progress', async () => {
      const mockEvent: Lecture = {
        id: 'lecture-123',
        name: 'Test Lecture',
        date: new Date().toISOString(),
        roomId: 'room-123',
        type: 'lecture',
        status: 'scheduled',
        teacherId: 'teacher-1',
        createdBy: 'teacher-1',
        description: 'Test',
        maxParticipants: 20
      }

      const mockRoom = {
        id: 'room-123',
        name: 'Test Room',
        status: 'scheduled',
        currentLecture: {
          id: 'lecture-123',
          name: 'Test Lecture',
          teacherId: 'teacher-1',
          status: 'scheduled'
        }
      }

      const updatedEvent = { ...mockEvent, status: 'in-progress' as const, startTime: expect.any(String) }
      const updatedRoom = {
        ...mockRoom,
        status: 'occupied',
        currentLecture: { ...mockRoom.currentLecture, status: 'in-progress' }
      }

      mockDb.findOne.mockResolvedValueOnce(mockEvent).mockResolvedValueOnce(mockRoom)
      mockDb.update.mockResolvedValueOnce(updatedEvent).mockResolvedValueOnce(updatedRoom)

      await eventSystem.updateEventStatus('lecture-123', 'in-progress')

      // clearRoom should NOT be called for in-progress
      expect(mockCommsSystem.clearRoom).not.toHaveBeenCalled()
    })

    it('should not call clearRoom when lecture status changes to delayed', async () => {
      const mockEvent: Lecture = {
        id: 'lecture-123',
        name: 'Test Lecture',
        date: new Date().toISOString(),
        roomId: 'room-123',
        type: 'lecture',
        status: 'scheduled',
        teacherId: 'teacher-1',
        createdBy: 'teacher-1',
        description: 'Test',
        maxParticipants: 20
      }

      const mockRoom = {
        id: 'room-123',
        name: 'Test Room',
        status: 'scheduled',
        currentLecture: {
          id: 'lecture-123',
          name: 'Test Lecture',
          teacherId: 'teacher-1',
          status: 'scheduled'
        }
      }

      const updatedEvent = { ...mockEvent, status: 'delayed' as const }
      const updatedRoom = {
        ...mockRoom,
        status: 'scheduled',
        currentLecture: { ...mockRoom.currentLecture, status: 'delayed' }
      }

      mockDb.findOne.mockResolvedValueOnce(mockEvent).mockResolvedValueOnce(mockRoom)
      mockDb.update.mockResolvedValueOnce(updatedEvent).mockResolvedValueOnce(updatedRoom)

      await eventSystem.updateEventStatus('lecture-123', 'delayed')

      // clearRoom should NOT be called for delayed
      expect(mockCommsSystem.clearRoom).not.toHaveBeenCalled()
    })

    it('should update room status to available when lecture completes', async () => {
      const mockEvent: Lecture = {
        id: 'lecture-123',
        name: 'Test Lecture',
        date: new Date().toISOString(),
        roomId: 'room-123',
        type: 'lecture',
        status: 'in-progress',
        teacherId: 'teacher-1',
        createdBy: 'teacher-1',
        description: 'Test',
        maxParticipants: 20
      }

      const mockRoom = {
        id: 'room-123',
        name: 'Test Room',
        status: 'occupied',
        currentLecture: {
          id: 'lecture-123',
          name: 'Test Lecture',
          teacherId: 'teacher-1',
          status: 'in-progress'
        }
      }

      const updatedEvent = { ...mockEvent, status: 'completed' as const, endTime: expect.any(String) }
      const updatedRoom = { ...mockRoom, status: 'available', currentLecture: undefined }

      mockDb.findOne.mockResolvedValueOnce(mockEvent).mockResolvedValueOnce(mockRoom)
      mockDb.update.mockResolvedValueOnce(updatedEvent).mockResolvedValueOnce(updatedRoom)

      await eventSystem.updateEventStatus('lecture-123', 'completed')

      // Verify room was updated to available
      expect(mockDb.update).toHaveBeenCalledWith(
        'rooms',
        { id: 'room-123' },
        expect.objectContaining({
          status: 'available',
          currentLecture: undefined
        })
      )
    })

    it('should not call clearRoom if commsSystem is not set', async () => {
      const newEventSystem = new EventManagementSystem()
      // Don't set commsSystem

      const mockEvent: Lecture = {
        id: 'lecture-123',
        name: 'Test Lecture',
        date: new Date().toISOString(),
        roomId: 'room-123',
        type: 'lecture',
        status: 'in-progress',
        teacherId: 'teacher-1',
        createdBy: 'teacher-1',
        description: 'Test',
        maxParticipants: 20
      }

      const mockRoom = {
        id: 'room-123',
        name: 'Test Room',
        status: 'occupied',
        currentLecture: {
          id: 'lecture-123',
          name: 'Test Lecture',
          teacherId: 'teacher-1',
          status: 'in-progress'
        }
      }

      const updatedEvent = { ...mockEvent, status: 'completed' as const, endTime: expect.any(String) }
      const updatedRoom = { ...mockRoom, status: 'available', currentLecture: undefined }

      mockDb.findOne.mockResolvedValueOnce(mockEvent).mockResolvedValueOnce(mockRoom)
      mockDb.update.mockResolvedValueOnce(updatedEvent).mockResolvedValueOnce(updatedRoom)

      await newEventSystem.updateEventStatus('lecture-123', 'completed')

      // clearRoom should not be called
      expect(mockCommsSystem.clearRoom).not.toHaveBeenCalled()
    })
  })

  describe('Integration with room lifecycle', () => {
    it('should clear room data when lecture flow: scheduled -> in-progress -> completed', async () => {
      const mockEvent: Lecture = {
        id: 'lecture-123',
        name: 'Test Lecture',
        date: new Date().toISOString(),
        roomId: 'room-123',
        type: 'lecture',
        status: 'scheduled',
        teacherId: 'teacher-1',
        createdBy: 'teacher-1',
        description: 'Test',
        maxParticipants: 20
      }

      const mockRoom = {
        id: 'room-123',
        name: 'Test Room',
        status: 'scheduled',
        currentLecture: {
          id: 'lecture-123',
          name: 'Test Lecture',
          teacherId: 'teacher-1',
          status: 'scheduled'
        }
      }

      // Start lecture (scheduled -> in-progress)
      const updatedForInProgress = {
        ...mockRoom,
        status: 'occupied',
        currentLecture: { ...mockRoom.currentLecture, status: 'in-progress' }
      }
      mockDb.findOne.mockResolvedValueOnce(mockEvent).mockResolvedValueOnce(mockRoom)
      mockDb.update
        .mockResolvedValueOnce({ ...mockEvent, status: 'in-progress', startTime: expect.any(String) })
        .mockResolvedValueOnce(updatedForInProgress)

      await eventSystem.updateEventStatus('lecture-123', 'in-progress')

      // clearRoom should NOT be called yet
      expect(mockCommsSystem.clearRoom).not.toHaveBeenCalled()

      // Complete lecture (in-progress -> completed)
      const inProgressEvent = { ...mockEvent, status: 'in-progress' as const }
      const occupiedRoom = { ...mockRoom, status: 'occupied', currentLecture: { ...mockRoom.currentLecture, status: 'in-progress' } }
      const completedRoom = { ...occupiedRoom, status: 'available', currentLecture: undefined }

      mockDb.findOne.mockResolvedValueOnce(inProgressEvent).mockResolvedValueOnce(occupiedRoom)
      mockDb.update
        .mockResolvedValueOnce({ ...inProgressEvent, status: 'completed', endTime: expect.any(String) })
        .mockResolvedValueOnce(completedRoom)

      await eventSystem.updateEventStatus('lecture-123', 'completed')

      // NOW clearRoom should be called
      expect(mockCommsSystem.clearRoom).toHaveBeenCalledWith('room-123')
      expect(mockCommsSystem.clearRoom).toHaveBeenCalledTimes(1)
    })

    it('should clear room data when lecture is cancelled mid-session', async () => {
      const mockEvent: Lecture = {
        id: 'lecture-123',
        name: 'Test Lecture',
        date: new Date().toISOString(),
        roomId: 'room-123',
        type: 'lecture',
        status: 'in-progress',
        teacherId: 'teacher-1',
        createdBy: 'teacher-1',
        description: 'Test',
        maxParticipants: 20
      }

      const mockRoom = {
        id: 'room-123',
        name: 'Test Room',
        status: 'occupied',
        currentLecture: {
          id: 'lecture-123',
          name: 'Test Lecture',
          teacherId: 'teacher-1',
          status: 'in-progress'
        }
      }

      const updatedRoom = { ...mockRoom, status: 'available', currentLecture: undefined }

      mockDb.findOne.mockResolvedValueOnce(mockEvent).mockResolvedValueOnce(mockRoom)
      mockDb.update
        .mockResolvedValueOnce({ ...mockEvent, status: 'cancelled' })
        .mockResolvedValueOnce(updatedRoom)

      await eventSystem.updateEventStatus('lecture-123', 'cancelled')

      // Verify clearRoom was called
      expect(mockCommsSystem.clearRoom).toHaveBeenCalledWith('room-123')
    })
  })
})
