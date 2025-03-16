import { z } from 'zod';
export declare const CreateLectureSchema: z.ZodObject<{
    name: z.ZodString;
    date: z.ZodString;
    roomId: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    maxParticipants: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    name: string;
    date: string;
    roomId: string;
    maxParticipants?: number | undefined;
    description?: string | undefined;
}, {
    name: string;
    date: string;
    roomId: string;
    maxParticipants?: number | undefined;
    description?: string | undefined;
}>;
export declare const UpdateLectureSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    date: z.ZodOptional<z.ZodString>;
    roomId: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    maxParticipants: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    maxParticipants?: number | undefined;
    name?: string | undefined;
    date?: string | undefined;
    roomId?: string | undefined;
    description?: string | undefined;
}, {
    maxParticipants?: number | undefined;
    name?: string | undefined;
    date?: string | undefined;
    roomId?: string | undefined;
    description?: string | undefined;
}>;
export type CreateLectureInput = z.infer<typeof CreateLectureSchema>;
export type UpdateLectureInput = z.infer<typeof UpdateLectureSchema>;
