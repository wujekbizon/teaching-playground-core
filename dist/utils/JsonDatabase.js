"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonDatabase = void 0;
const promises_1 = require("node:fs/promises");
const path_1 = __importDefault(require("path"));
const interfaces_1 = require("../interfaces");
class JsonDatabase {
    constructor(filename = 'test-data.json') {
        this.dbPath = path_1.default.join(process.cwd(), 'data', filename);
        this.data = null;
    }
    async load() {
        try {
            const content = await (0, promises_1.readFile)(this.dbPath, 'utf-8');
            this.data = JSON.parse(content);
        }
        catch (error) {
            if (error.code === 'ENOENT') {
                this.data = { events: [], rooms: [], participants: [] };
                await this.save();
            }
            else {
                throw new interfaces_1.SystemError('DATABASE_READ_ERROR', 'Failed to read database');
            }
        }
    }
    async save() {
        try {
            if (!this.data) {
                await this.load();
            }
            await (0, promises_1.writeFile)(this.dbPath, JSON.stringify(this.data, null, 2), 'utf-8');
        }
        catch (error) {
            console.error('Save error:', error);
            throw new interfaces_1.SystemError('DATABASE_WRITE_ERROR', 'Failed to write to database');
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
        return document;
    }
    async update(collection, query, update) {
        await this.load();
        const index = this.data[collection].findIndex((item) => Object.entries(query).every(([key, value]) => item[key] === value));
        if (index !== -1) {
            this.data[collection][index] = {
                ...this.data[collection][index],
                ...update,
                lastModified: new Date().toISOString(),
            };
            await this.save();
            return this.data[collection][index];
        }
        return null;
    }
    async delete(collection, query) {
        await this.load();
        const initialLength = this.data[collection].length;
        this.data[collection] = this.data[collection].filter((item) => !Object.entries(query).every(([key, value]) => item[key] === value));
        await this.save();
        return initialLength !== this.data[collection].length;
    }
}
exports.JsonDatabase = JsonDatabase;
