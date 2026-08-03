export interface DataConfig {
  databaseUrl?: string
  [key: string]: any
}

export interface PersistenceAdapter {
  find(collection: string, query?: Record<string, any>): Promise<any[]>
  findOne(collection: string, query: Record<string, any>): Promise<any | null>
  insert(collection: string, item: Record<string, any>): Promise<Record<string, any>>
  update(collection: string, query: Record<string, any>, updates: Record<string, any>): Promise<any | null>
  delete(collection: string, query: Record<string, any>): Promise<any>
}
