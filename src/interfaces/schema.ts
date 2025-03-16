import { z } from 'zod'

export const CreateLectureSchema = z.object({
  name: z
    .string()
    .min(3, 'Lecture name must be at least 3 characters')
    .max(100, 'Lecture name cannot exceed 100 characters'),
  date: z.string().min(1, 'Date is required'),
  roomId: z.string().min(1, 'Room ID is required'),
  description: z
    .string()
    .min(10, 'Description must be at least 10 characters')
    .max(500, 'Description cannot exceed 500 characters')
    .optional(),
  maxParticipants: z
    .number()
    .min(1, 'Must have at least 1 participant')
    .max(100, 'Cannot exceed 100 participants')
    .optional(),
})

export const UpdateLectureSchema = CreateLectureSchema.partial()

export type CreateLectureInput = z.infer<typeof CreateLectureSchema>
export type UpdateLectureInput = z.infer<typeof UpdateLectureSchema> 