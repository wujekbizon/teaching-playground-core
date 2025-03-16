"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UpdateLectureSchema = exports.CreateLectureSchema = void 0;
const zod_1 = require("zod");
exports.CreateLectureSchema = zod_1.z.object({
    name: zod_1.z
        .string()
        .min(3, 'Lecture name must be at least 3 characters')
        .max(100, 'Lecture name cannot exceed 100 characters'),
    date: zod_1.z.string().min(1, 'Date is required'),
    roomId: zod_1.z.string().min(1, 'Room ID is required'),
    description: zod_1.z
        .string()
        .min(10, 'Description must be at least 10 characters')
        .max(500, 'Description cannot exceed 500 characters')
        .optional(),
    maxParticipants: zod_1.z
        .number()
        .min(1, 'Must have at least 1 participant')
        .max(100, 'Cannot exceed 100 participants')
        .optional(),
});
exports.UpdateLectureSchema = exports.CreateLectureSchema.partial();
