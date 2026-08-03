import type { User } from './user.interface'

export interface SocketIdentityContext {
  auth: Record<string, unknown>
  headers: Record<string, string | string[] | undefined>
}

export type SocketIdentityProvider = (
  context: SocketIdentityContext
) => User | null | Promise<User | null>

/** Socket.IO-compatible adapter constructor (for example, a Redis adapter). */
export type SocketAdapterFactory = new (namespace: unknown) => unknown

export interface CommsConfig {
  signalingServerUrl?: string
  allowedOrigins?: string | string[]
  requireAuthentication?: boolean
  identityProvider?: SocketIdentityProvider
  socketAdapter?: SocketAdapterFactory
}
