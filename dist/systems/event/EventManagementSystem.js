import { SystemError } from '../../interfaces/errors.interface';
import { CreateLectureSchema, UpdateLectureSchema } from '../../interfaces/schema';
import { JsonDatabase } from '../../utils/JsonDatabase';
export class EventManagementSystem {
    constructor(config) {
        this.config = config;
        this.db = new JsonDatabase();
    }
    async createEvent(options) {
        try {
            // Log the incoming data
            console.log('Creating event with options:', options);
            const validationResult = CreateLectureSchema.safeParse(options);
            if (!validationResult.success) {
                console.error('Validation error:', validationResult.error.flatten());
                throw new SystemError('EVENT_VALIDATION_FAILED', 'Invalid lecture data', validationResult.error.flatten());
            }
            const event = {
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
            };
            // Log the event before insertion
            console.log('Event to be inserted:', event);
            await this.db.insert('events', event);
            return event;
        }
        catch (error) {
            // Log the full error
            console.error('Event creation error:', error);
            if (error instanceof SystemError)
                throw error;
            throw new SystemError('EVENT_CREATION_FAILED', 'Failed to create event', error);
        }
    }
    async cancelEvent(eventId) {
        try {
            const updated = await this.db.update('events', { id: eventId }, { status: 'cancelled' });
            if (!updated) {
                throw new SystemError('EVENT_NOT_FOUND', `Event ${eventId} not found`);
            }
        }
        catch (error) {
            throw new SystemError('EVENT_CANCELLATION_FAILED', 'Failed to cancel event', error);
        }
    }
    async getEvent(eventId) {
        try {
            const event = await this.db.findOne('events', { id: eventId });
            if (!event) {
                throw new SystemError('EVENT_NOT_FOUND', `Event ${eventId} not found`);
            }
            return event;
        }
        catch (error) {
            throw new SystemError('EVENT_FETCH_FAILED', 'Failed to fetch event', error);
        }
    }
    async listEvents(filter) {
        try {
            const query = { type: filter.type };
            if (filter.roomId !== undefined)
                query.roomId = filter.roomId;
            if (filter.teacherId !== undefined)
                query.teacherId = filter.teacherId;
            if (filter.status !== undefined)
                query.status = filter.status;
            return await this.db.find('events', query);
        }
        catch (error) {
            throw new SystemError('EVENT_LIST_FAILED', 'Failed to list events', error);
        }
    }
    async updateEvent(eventId, updates) {
        try {
            // Validate updates
            const validationResult = UpdateLectureSchema.safeParse(updates);
            if (!validationResult.success) {
                throw new SystemError('EVENT_VALIDATION_FAILED', 'Invalid lecture update data', validationResult.error.flatten());
            }
            const updated = await this.db.update('events', { id: eventId }, validationResult.data);
            if (!updated) {
                throw new SystemError('EVENT_NOT_FOUND', `Event ${eventId} not found`);
            }
            return updated;
        }
        catch (error) {
            if (error instanceof SystemError)
                throw error;
            throw new SystemError('EVENT_UPDATE_FAILED', 'Failed to update event', error);
        }
    }
    async updateEventStatus(eventId, newStatus) {
        try {
            const event = (await this.db.findOne('events', { id: eventId }));
            if (!event) {
                throw new SystemError('EVENT_NOT_FOUND', `Event ${eventId} not found`);
            }
            const allowedTransitions = {
                scheduled: ['in-progress', 'cancelled', 'delayed'],
                delayed: ['in-progress', 'cancelled'],
                'in-progress': ['completed', 'cancelled'],
                completed: [], // Final state
                cancelled: [], // Final state
            };
            if (!allowedTransitions[event.status]?.includes(newStatus)) {
                throw new SystemError('INVALID_STATUS_TRANSITION', `Cannot transition from ${event.status} to ${newStatus}`);
            }
            const updates = {
                status: newStatus,
                ...(newStatus === 'in-progress' && { startTime: new Date().toISOString() }),
                ...(newStatus === 'completed' && { endTime: new Date().toISOString() }),
            };
            const updated = await this.db.update('events', { id: eventId }, updates);
            if (!updated) {
                throw new SystemError('EVENT_UPDATE_FAILED', 'Failed to update event status');
            }
            return updated;
        }
        catch (error) {
            if (error instanceof SystemError)
                throw error;
            throw new SystemError('EVENT_UPDATE_FAILED', 'Failed to update event status', error);
        }
    }
}
