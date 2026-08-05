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

export interface TrustedLaunchClaims {
  provider: string
  organizationId: string
  reservationId: string
  roomId: string
  userId: string
  role?: User['role']
  allowed: true
  issuedAt?: string
  expiresAt?: string
  notBefore?: string
  reason?: string
  metadata?: Record<string, unknown>
}

export interface LaunchClaimContext {
  claims: unknown
  user: User
  roomId: string
  reservationId?: string
  auth: Record<string, unknown>
  headers: Record<string, string | string[] | undefined>
}

export type LaunchClaimVerifier = (
  context: LaunchClaimContext
) => TrustedLaunchClaims | null | Promise<TrustedLaunchClaims | null>

export type LaunchClaimSource = 'joinPayload' | 'handshakeAuth' | 'either'

export interface CommsConfig {
  signalingServerUrl?: string
  allowedOrigins?: string | string[]
  requireAuthentication?: boolean
  identityProvider?: SocketIdentityProvider
  socketAdapter?: SocketAdapterFactory
  /** Require host-owned launch claims before reservation-backed admission succeeds. */
  requireLaunchClaims?: boolean
  /** Host-provided verifier for signed/opaque launch claims. The engine only enforces returned claims. */
  launchClaimVerifier?: LaunchClaimVerifier
  /** Where clients provide claims; defaults to 'either'. */
  launchClaimSource?: LaunchClaimSource
}
