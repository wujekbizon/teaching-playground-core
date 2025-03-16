export class SystemError extends Error {
  constructor(public code: string, message: string, public details?: any) {
    super(message)
    this.name = 'SystemError'
  }
}

export type ErrorCode =
  | 'LECTURE_CANCELLATION_FAILED'
  | 'LECTURE_LIST_FAILED'
  | 'LECTURE_DETAILS_FAILED'
  | 'ROOM_CREATION_FAILED'
  | 'COMMUNICATION_SETUP_FAILED'
  | 'SYSTEM_INITIALIZATION_FAILED'
  | 'DATA_SAVE_FAILED'
  | 'DATA_FETCH_FAILED'
  | 'DATA_DELETE_FAILED'
  | 'DATA_BACKUP_FAILED'
  | 'DATA_RESTORE_FAILED'
  | 'DATA_STATS_FAILED'
  | 'EVENT_NOT_FOUND'
  | 'EVENT_UPDATE_FAILED'
  | 'DATABASE_READ_ERROR'
  | 'DATABASE_WRITE_ERROR'
