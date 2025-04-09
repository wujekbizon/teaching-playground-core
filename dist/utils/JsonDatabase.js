import { SystemError } from '../interfaces';
import fs from 'fs';
import path from 'path';
// Single database instance for the entire application
let databaseInstance = null;
export class JsonDatabase {
    constructor(filename = 'test-data.json') {
        this.dbPath = 'test-data.json';
        this.data = null;
        this.isServer = typeof window === 'undefined';
        this.apiBaseUrl = '/api';
        this.isSyncingToFile = false;
        // Return existing instance if already created
        if (databaseInstance) {
            return databaseInstance;
        }
        this.dbPath = filename;
        this.data = null;
        this.isServer = typeof window === 'undefined';
        this.apiBaseUrl = '/api';
        // Store as singleton instance
        databaseInstance = this;
        console.log('Created singleton JsonDatabase instance');
        // Force initial load
        this.load().then(() => {
            console.log('Initial database load complete');
        });
    }
    // Public method to get the singleton instance
    static getInstance(filename = 'test-data.json') {
        if (!databaseInstance) {
            databaseInstance = new JsonDatabase(filename);
        }
        return databaseInstance;
    }
    getInitialData() {
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
        };
    }
    async ensureDataDirectory() {
        if (this.isServer) {
            const { existsSync, mkdir } = require('fs');
            const { join } = require('path');
            const dataDir = join(process.cwd(), 'data');
            if (!existsSync(dataDir)) {
                await mkdir(dataDir, { recursive: true });
            }
        }
    }
    // Method to sync directly to the file system
    // This is useful for debugging and ensuring the file is updated
    async syncToFile() {
        if (!this.isServer || this.isSyncingToFile)
            return;
        try {
            this.isSyncingToFile = true;
            await this.ensureDataDirectory();
            const filePath = path.join(process.cwd(), 'data', this.dbPath);
            await fs.promises.writeFile(filePath, JSON.stringify(this.data, null, 2), 'utf-8');
            console.log(`Database synced to file: ${filePath}`);
        }
        catch (error) {
            console.error('Error syncing to file:', error);
        }
        finally {
            this.isSyncingToFile = false;
        }
    }
    async load() {
        try {
            if (this.isServer) {
                await this.ensureDataDirectory();
                const { readFile } = require('fs/promises');
                const { join } = require('path');
                const content = await readFile(join(process.cwd(), 'data', this.dbPath), 'utf-8');
                this.data = JSON.parse(content);
            }
            else {
                // In browser, use API endpoints and localStorage for participants
                const response = await fetch(`${this.apiBaseUrl}/rooms`);
                if (!response.ok) {
                    throw new Error('Failed to fetch data from API');
                }
                const rooms = await response.json();
                // Get participants from localStorage
                const storedParticipants = localStorage.getItem('room_participants');
                const participants = storedParticipants ? JSON.parse(storedParticipants) : {};
                // Merge participants into rooms
                rooms.forEach((room) => {
                    if (participants[room.id]) {
                        room.participants = participants[room.id];
                    }
                });
                this.data = { rooms, events: [], participants: [] };
            }
        }
        catch (error) {
            console.error('Load error:', error);
            this.data = this.getInitialData();
            // Save the initial data to disk if we're on the server
            if (this.isServer) {
                await this.syncToFile();
            }
        }
    }
    async save() {
        try {
            if (!this.data) {
                await this.load();
            }
            if (this.isServer) {
                const { writeFile } = require('fs/promises');
                const { join } = require('path');
                await writeFile(join(process.cwd(), 'data', this.dbPath), JSON.stringify(this.data, null, 2), 'utf-8');
            }
            else {
                // In browser, save participants to localStorage
                const participants = {};
                this.data.rooms.forEach((room) => {
                    if (room.participants?.length > 0) {
                        participants[room.id] = room.participants;
                    }
                });
                localStorage.setItem('room_participants', JSON.stringify(participants));
                // Update rooms via API
                const response = await fetch(`${this.apiBaseUrl}/rooms`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(this.data.rooms),
                });
                if (!response.ok) {
                    throw new Error('Failed to update data via API');
                }
            }
        }
        catch (error) {
            console.error('Save error:', error);
            throw new SystemError('DATABASE_WRITE_ERROR', 'Failed to write to database');
        }
    }
    async find(collection, query = {}) {
        await this.load();
        return this.data[collection].filter((item) => Object.entries(query).every(([key, value]) => item[key] === value));
    }
    async findOne(collection, query) {
        const results = await this.find(collection, query);
        return results[0] || null;
    }
    async insert(collection, document) {
        await this.load();
        this.data[collection].push(document);
        await this.save();
        // Also sync to file directly for participant changes
        if (collection === 'rooms' && document.participants) {
            await this.syncToFile();
        }
        return document;
    }
    async update(collection, query, update) {
        await this.load();
        const index = this.data[collection].findIndex((item) => Object.entries(query).every(([key, value]) => item[key] === value));
        if (index !== -1) {
            // Special handling for participants array updates
            if (update.participants) {
                const currentParticipants = this.data[collection][index].participants || [];
                const updatedParticipants = update.participants;
                // Track if participants actually changed
                const beforeParticipantIds = new Set(currentParticipants.map((p) => p.id));
                const afterParticipantIds = new Set(updatedParticipants.map((p) => p.id));
                const participantsChanged = beforeParticipantIds.size !== afterParticipantIds.size ||
                    [...beforeParticipantIds].some(id => !afterParticipantIds.has(id));
                // Log the participant change
                if (participantsChanged) {
                    console.log(`Participants changed for ${collection} ${query.id}:`, {
                        before: currentParticipants.map((p) => `${p.username} (${p.id})`),
                        after: updatedParticipants.map((p) => `${p.username} (${p.id})`)
                    });
                }
                // Remove participants that are no longer present
                const remainingParticipants = currentParticipants.filter((p) => updatedParticipants.some((up) => up.id === p.id));
                // Add new participants
                updatedParticipants.forEach((participant) => {
                    const existingIndex = remainingParticipants.findIndex((p) => p.id === participant.id);
                    if (existingIndex === -1) {
                        remainingParticipants.push(participant);
                    }
                    else {
                        remainingParticipants[existingIndex] = participant;
                    }
                });
                update.participants = remainingParticipants;
            }
            this.data[collection][index] = {
                ...this.data[collection][index],
                ...update,
                lastModified: new Date().toISOString(),
            };
            await this.save();
            // Force a direct file sync when participant changes are made
            if (collection === 'rooms' && update.participants) {
                await this.syncToFile();
            }
            return this.data[collection][index];
        }
        return null;
    }
    async delete(collection, query) {
        await this.load();
        const initialLength = this.data[collection].length;
        this.data[collection] = this.data[collection].filter((item) => !Object.entries(query).every(([key, value]) => item[key] === value));
        await this.save();
        // If we deleted a room, sync the file
        if (collection === 'rooms') {
            await this.syncToFile();
        }
        return initialLength !== this.data[collection].length;
    }
}
