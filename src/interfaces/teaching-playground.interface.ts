import { CommsConfig, DataConfig, EventConfig, RoomConfig } from './index'
import type { PersistenceAdapter } from './data.interface'

export interface TeachingPlaygroundConfig {
  roomConfig?: RoomConfig
  commsConfig?: CommsConfig
  eventConfig?: EventConfig
  dataConfig?: DataConfig
  persistence?: PersistenceAdapter
}
