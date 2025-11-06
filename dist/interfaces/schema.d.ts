import { z } from 'zod';
export declare const CreateLectureSchema: any;
export declare const UpdateLectureSchema: any;
export type CreateLectureInput = z.infer<typeof CreateLectureSchema>;
export type UpdateLectureInput = z.infer<typeof UpdateLectureSchema>;
