import { CommsConfig, DataConfig, EventConfig, RoomConfig } from './index'

export interface TeachingPlaygroundConfig {
  roomConfig?: RoomConfig
  commsConfig?: CommsConfig
  eventConfig?: EventConfig
  dataConfig?: DataConfig
}
