import { SystemError } from '../interfaces'
import fs from 'fs'
import path from 'path'

// Single database instance for the entire application
let databaseInstance: JsonDatabase | null = null;

export class JsonDatabase {
  private dbPath: string = 'test-data.json'
  private data: any = null
  private isServer: boolean = typeof window === 'undefined'
  private apiBaseUrl: string = '/api'
  private isSyncingToFile: boolean = false
  private operationLock: Map<string, Promise<any>> = new Map()
  private dataLock: Promise<void> | null = null

  constructor(filename: string = 'test-data.json') {
    // Return existing instance if already created
    if (databaseInstance) {
      return databaseInstance;
    }
    
    this.dbPath = filename
    this.data = null
    this.isServer = typeof window === 'undefined'
    this.apiBaseUrl = '/api'
    
    // Store as singleton instance
    databaseInstance = this;
    console.log('Created singleton JsonDatabase instance');

    // Force initial load
    this.load().then(() => {
      console.log('Initial database load complete');
    });
  }

  // Public method to get the singleton instance
  static getInstance(filename: string = 'test-data.json'): JsonDatabase {
    if (!databaseInstance) {
      databaseInstance = new JsonDatabase(filename);
    }
    return databaseInstance;
  }

  /**
   * Lock mechanism to prevent race conditions on concurrent operations
   * Ensures operations are serialized per collection
   */
  private async lockOperation<T>(key: string, operation: () => Promise<T>): Promise<T> {
    // Wait for any existing operation on this key
    while (this.operationLock.has(key)) {
      await this.operationLock.get(key)
    }

    // Create and store the new operation promise
    const promise = operation()
    this.operationLock.set(key, promise)

    try {
      const result = await promise
      return result
    } finally {
      // Clean up the lock
      this.operationLock.delete(key)
    }
  }

  /**
   * Lock mechanism for data load/save operations
   * Ensures load and save operations don't overlap
   */
  private async lockDataOperation<T>(operation: () => Promise<T>): Promise<T> {
    // Wait for any existing data operation
    while (this.dataLock) {
      await this.dataLock
    }

    // Create a new lock
    let resolve: () => void
    this.dataLock = new Promise<void>((r) => { resolve = r })

    try {
      const result = await operation()
      return result
    } finally {
      // Release the lock
      resolve!()
      this.dataLock = null
    }
  }

  private getInitialData() {
    return {
      events: [],
      rooms: [
        {
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
          participants: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      ],
      participants: []
    }
  }

  private async ensureDataDirectory() {
    if (this.isServer) {
      const { existsSync, mkdir } = require('fs')
      const { join } = require('path')
      const dataDir = join(process.cwd(), 'data')
      if (!existsSync(dataDir)) {
        await mkdir(dataDir, { recursive: true })
      }
    }
  }

  // Method to sync directly to the file system
  // This is useful for debugging and ensuring the file is updated
  private async syncToFile() {
    if (!this.isServer || this.isSyncingToFile) return;
    
    try {
      this.isSyncingToFile = true;
      await this.ensureDataDirectory();
      
      const filePath = path.join(process.cwd(), 'data', this.dbPath);
      await fs.promises.writeFile(filePath, JSON.stringify(this.data, null, 2), 'utf-8');
      
      console.log(`Database synced to file: ${filePath}`);
    } catch (error) {
      console.error('Error syncing to file:', error);
    } finally {
      this.isSyncingToFile = false;
    }
  }

  private async load() {
    return this.lockDataOperation(async () => {
      try {
        if (this.isServer) {
          await this.ensureDataDirectory()
          const { readFile } = require('fs/promises')
          const { join } = require('path')
          const content = await readFile(join(process.cwd(), 'data', this.dbPath), 'utf-8')
          this.data = JSON.parse(content)
        } else {
          // In browser, use API endpoints and localStorage for participants
          const response = await fetch(`${this.apiBaseUrl}/rooms`)
          if (!response.ok) {
            throw new Error('Failed to fetch data from API')
          }
          const rooms = await response.json()

          // Get participants from localStorage
          const storedParticipants = localStorage.getItem('room_participants')
          const participants = storedParticipants ? JSON.parse(storedParticipants) : {}

          // Merge participants into rooms
          rooms.forEach((room: any) => {
            if (participants[room.id]) {
              room.participants = participants[room.id]
            }
          })

          this.data = { rooms, events: [], participants: [] }
        }
      } catch (error) {
        console.error('Load error:', error)
        this.data = this.getInitialData()

        // Save the initial data to disk if we're on the server
        if (this.isServer) {
          await this.syncToFile();
        }
      }
    })
  }

  private async save() {
    return this.lockDataOperation(async () => {
      try {
        if (!this.data) {
          await this.load()
        }

        if (this.isServer) {
          const { writeFile } = require('fs/promises')
          const { join } = require('path')
          await writeFile(join(process.cwd(), 'data', this.dbPath), JSON.stringify(this.data, null, 2), 'utf-8')
        } else {
          // In browser, save participants to localStorage
          const participants: { [roomId: string]: any[] } = {}
          this.data.rooms.forEach((room: any) => {
            if (room.participants?.length > 0) {
              participants[room.id] = room.participants
            }
          })
          localStorage.setItem('room_participants', JSON.stringify(participants))

          // Update rooms via API
          const response = await fetch(`${this.apiBaseUrl}/rooms`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(this.data.rooms),
          })

          if (!response.ok) {
            throw new Error('Failed to update data via API')
          }
        }
      } catch (error) {
        console.error('Save error:', error)
        throw new SystemError('DATABASE_WRITE_ERROR', 'Failed to write to database')
      }
    })
  }

  async find(collection: string, query: Record<string, any> = {}) {
    return this.lockOperation(`find:${collection}`, async () => {
      await this.load()
      return this.data[collection].filter((item: any) =>
        Object.entries(query).every(([key, value]) => item[key] === value)
      )
    })
  }

  async findOne(collection: string, query: Record<string, any>) {
    return this.lockOperation(`findOne:${collection}`, async () => {
      const results = await this.find(collection, query)
      return results[0] || null
    })
  }

  async insert(collection: string, document: Record<string, any>) {
    return this.lockOperation(`insert:${collection}`, async () => {
      await this.load()
      this.data[collection].push(document)
      await this.save()

      // Also sync to file directly for participant changes
      if (collection === 'rooms' && document.participants) {
        await this.syncToFile();
      }

      return document
    })
  }

  async update(collection: string, query: Record<string, any>, update: Record<string, any>) {
    return this.lockOperation(`update:${collection}:${JSON.stringify(query)}`, async () => {
      await this.load()
      const index = this.data[collection].findIndex((item: any) =>
        Object.entries(query).every(([key, value]) => item[key] === value)
      )

      if (index !== -1) {
        // Special handling for participants array updates
        if (update.participants) {
          const currentParticipants = this.data[collection][index].participants || []
          const updatedParticipants = update.participants

          // Track if participants actually changed
          const beforeParticipantIds = new Set(currentParticipants.map((p: any) => p.id));
          const afterParticipantIds = new Set(updatedParticipants.map((p: any) => p.id));
          const participantsChanged =
            beforeParticipantIds.size !== afterParticipantIds.size ||
            [...beforeParticipantIds].some(id => !afterParticipantIds.has(id));

          // Log the participant change
          if (participantsChanged) {
            console.log(`Participants changed for ${collection} ${query.id}:`, {
              before: currentParticipants.map((p: any) => `${p.username} (${p.id})`),
              after: updatedParticipants.map((p: any) => `${p.username} (${p.id})`)
            });
          }

          // Remove participants that are no longer present
          const remainingParticipants = currentParticipants.filter(
            (p: any) => updatedParticipants.some((up: any) => up.id === p.id)
          )

          // Add new participants
          updatedParticipants.forEach((participant: any) => {
            const existingIndex = remainingParticipants.findIndex((p: any) => p.id === participant.id)
            if (existingIndex === -1) {
              remainingParticipants.push(participant)
            } else {
              remainingParticipants[existingIndex] = participant
            }
          })

          update.participants = remainingParticipants
        }

        this.data[collection][index] = {
          ...this.data[collection][index],
          ...update,
          lastModified: new Date().toISOString(),
        }

        await this.save()

        // Force a direct file sync when participant changes are made
        if (collection === 'rooms' && update.participants) {
          await this.syncToFile();
        }

        return this.data[collection][index]
      }
      return null
    })
  }

  async delete(collection: string, query: Record<string, any>) {
    return this.lockOperation(`delete:${collection}:${JSON.stringify(query)}`, async () => {
      await this.load()
      const initialLength = this.data[collection].length
      this.data[collection] = this.data[collection].filter(
        (item: any) => !Object.entries(query).every(([key, value]) => item[key] === value)
      )
      await this.save()

      // If we deleted a room, sync the file
      if (collection === 'rooms') {
        await this.syncToFile();
      }

      return initialLength !== this.data[collection].length
    })
  }
}
