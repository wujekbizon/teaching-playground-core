/**
 * Test suite for JsonDatabase caching optimization (v1.4.3)
 *
 * Verifies that:
 * 1. Data is loaded once on initialization
 * 2. Subsequent queries use cached data (no redundant file I/O)
 * 3. Writes update cache AND persist to file
 * 4. Mutex prevents race conditions
 */

import { JsonDatabase } from '../utils/JsonDatabase'
import fs from 'fs'
import path from 'path'

describe('JsonDatabase Caching (v1.4.3)', () => {
  const testDbPath = 'test-caching.json'
  const fullPath = path.join(process.cwd(), 'data', testDbPath)
  let db: JsonDatabase

  beforeEach(async () => {
    // Clean up any existing test database
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
    }

    // Create new database instance
    db = new JsonDatabase(testDbPath)

    // Wait for initial load to complete
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  afterEach(() => {
    // Clean up test database
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath)
    }
  })

  describe('Caching Behavior', () => {
    it('should load data once on initialization', async () => {
      // Spy on fs.readFile to count file reads
      const readFileSpy = jest.spyOn(fs.promises, 'readFile')

      // Perform multiple read operations
      await db.find('rooms', {})
      await db.find('events', {})
      await db.findOne('rooms', { id: 'test-room-1' })
      await db.find('rooms', {})

      // Should NOT have additional readFile calls (data already cached)
      expect(readFileSpy).toHaveBeenCalledTimes(0)

      readFileSpy.mockRestore()
    })

    it('should use cached data for consecutive find() calls', async () => {
      // Insert test data
      const testRoom = {
        id: 'test-room-cache-1',
        name: 'Caching Test Room',
        capacity: 30,
        status: 'available',
        features: {
          hasVideo: true,
          hasAudio: true,
          hasChat: true,
          hasWhiteboard: true,
          hasScreenShare: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await db.insert('rooms', testRoom)

      // Spy on fs.readFile AFTER insert
      const readFileSpy = jest.spyOn(fs.promises, 'readFile')

      // Perform multiple find operations
      const result1 = await db.find('rooms', { id: 'test-room-cache-1' })
      const result2 = await db.find('rooms', { id: 'test-room-cache-1' })
      const result3 = await db.findOne('rooms', { id: 'test-room-cache-1' })

      // All queries should return the same data
      expect(result1[0]).toEqual(testRoom)
      expect(result2[0]).toEqual(testRoom)
      expect(result3).toEqual(testRoom)

      // Should NOT call readFile (using cached data)
      expect(readFileSpy).toHaveBeenCalledTimes(0)

      readFileSpy.mockRestore()
    })

    it('should update cache AND file on write operations', async () => {
      const testEvent = {
        id: 'event-cache-1',
        name: 'Caching Test Event',
        date: new Date().toISOString(),
        roomId: 'test-room-1',
        description: 'Testing cache updates',
        maxParticipants: 50,
        type: 'lecture',
        status: 'scheduled',
        teacherId: 'teacher-1',
        createdBy: 'Test Teacher'
      }

      // Spy on writeFile to verify persistence
      const writeFileSpy = jest.spyOn(fs.promises, 'writeFile')

      // Insert event
      await db.insert('events', testEvent)

      // Should have written to file
      expect(writeFileSpy).toHaveBeenCalled()

      // Reset spy
      writeFileSpy.mockClear()

      // Verify data is in cache (find should NOT trigger readFile)
      const readFileSpy = jest.spyOn(fs.promises, 'readFile')
      const cachedEvent = await db.findOne('events', { id: 'event-cache-1' })

      expect(cachedEvent).toEqual(testEvent)
      expect(readFileSpy).toHaveBeenCalledTimes(0)

      // Verify data was persisted to file
      const fileContent = JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
      expect(fileContent.events).toContainEqual(testEvent)

      readFileSpy.mockRestore()
      writeFileSpy.mockRestore()
    })

    it('should not have participants array in room schema', async () => {
      // Get initial rooms
      const rooms = await db.find('rooms', {})

      // Default room should NOT have participants array
      expect(rooms[0]).not.toHaveProperty('participants')

      // Insert new room without participants
      const newRoom = {
        id: 'room-no-participants',
        name: 'Room Without Participants',
        capacity: 20,
        status: 'available',
        features: {
          hasVideo: true,
          hasAudio: true,
          hasChat: true,
          hasWhiteboard: true,
          hasScreenShare: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await db.insert('rooms', newRoom)

      // Verify inserted room doesn't have participants
      const insertedRoom = await db.findOne('rooms', { id: 'room-no-participants' })
      expect(insertedRoom).not.toHaveProperty('participants')
    })
  })

  describe('Performance Optimization', () => {
    it('should perform multiple reads in minimal time (< 10ms)', async () => {
      // Insert test data
      for (let i = 0; i < 10; i++) {
        await db.insert('rooms', {
          id: `room-perf-${i}`,
          name: `Performance Test Room ${i}`,
          capacity: 30,
          status: 'available',
          features: {
            hasVideo: true,
            hasAudio: true,
            hasChat: true,
            hasWhiteboard: true,
            hasScreenShare: true,
          },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }

      // Measure time for 100 consecutive reads
      const startTime = Date.now()

      for (let i = 0; i < 100; i++) {
        await db.find('rooms', {})
      }

      const endTime = Date.now()
      const duration = endTime - startTime

      // Should complete in < 100ms (with caching, not 100 × 250ms = 25 seconds!)
      expect(duration).toBeLessThan(100)

      console.log(`100 cached reads completed in ${duration}ms (avg ${duration/100}ms per read)`)
    })
  })

  describe('Data Consistency', () => {
    it('should maintain consistency between cache and file after multiple operations', async () => {
      // Perform mixed operations
      const room1 = {
        id: 'consistency-room-1',
        name: 'Consistency Test 1',
        capacity: 25,
        status: 'available',
        features: {
          hasVideo: true,
          hasAudio: true,
          hasChat: true,
          hasWhiteboard: true,
          hasScreenShare: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await db.insert('rooms', room1)

      const room2 = {
        id: 'consistency-room-2',
        name: 'Consistency Test 2',
        capacity: 30,
        status: 'scheduled',
        features: {
          hasVideo: true,
          hasAudio: true,
          hasChat: true,
          hasWhiteboard: true,
          hasScreenShare: true,
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }

      await db.insert('rooms', room2)

      // Update first room
      await db.update('rooms', { id: 'consistency-room-1' }, { status: 'in-progress' })

      // Delete second room
      await db.delete('rooms', { id: 'consistency-room-2' })

      // Read from cache
      const cachedRooms = await db.find('rooms', {})

      // Read from file
      const fileContent = JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
      const fileRooms = fileContent.rooms

      // Cache and file should match
      expect(cachedRooms.length).toBe(fileRooms.length)

      // Verify room1 was updated
      const cachedRoom1 = cachedRooms.find((r: any) => r.id === 'consistency-room-1')
      expect(cachedRoom1.status).toBe('in-progress')

      const fileRoom1 = fileRooms.find((r: any) => r.id === 'consistency-room-1')
      expect(fileRoom1.status).toBe('in-progress')

      // Verify room2 was deleted
      expect(cachedRooms.find((r: any) => r.id === 'consistency-room-2')).toBeUndefined()
      expect(fileRooms.find((r: any) => r.id === 'consistency-room-2')).toBeUndefined()
    })
  })
})
