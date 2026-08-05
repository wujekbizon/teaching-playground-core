import { createHmac } from 'crypto'

export interface TurnEnvironment {
  [key: string]: string | undefined
  TURN_URLS?: string
  TURN_USERNAME?: string
  TURN_CREDENTIAL?: string
  TURN_SHARED_SECRET?: string
  TURN_TTL_SECONDS?: string
  TURN_FORCE_RELAY?: string
}

export interface TurnConfigurationResponse {
  enabled: boolean
  relayOnly: boolean
  expiresAt?: string
  rtcConfiguration: RTCConfiguration
  diagnostics: string[]
}

const DEFAULT_TURN_TTL_SECONDS = 600
const MIN_TURN_TTL_SECONDS = 60
const MAX_TURN_TTL_SECONDS = 3600

function parseTurnUrls(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map(url => url.trim())
    .filter(Boolean)
}

function parseTtl(value?: string): number {
  if (!value) return DEFAULT_TURN_TTL_SECONDS
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_TURN_TTL_SECONDS
  return Math.min(MAX_TURN_TTL_SECONDS, Math.max(MIN_TURN_TTL_SECONDS, Math.floor(parsed)))
}

function isRelayOnly(value?: string): boolean {
  return value === 'true' || value === '1'
}

export function buildTurnConfiguration(env: TurnEnvironment = process.env, now = Date.now()): TurnConfigurationResponse {
  const urls = parseTurnUrls(env.TURN_URLS)
  const diagnostics: string[] = []
  const relayOnly = isRelayOnly(env.TURN_FORCE_RELAY)

  if (urls.length === 0) {
    diagnostics.push('TURN_URLS is not configured; using STUN-only diagnostics mode.')
    return {
      enabled: false,
      relayOnly,
      rtcConfiguration: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
      diagnostics,
    }
  }

  if (env.TURN_SHARED_SECRET) {
    const ttlSeconds = parseTtl(env.TURN_TTL_SECONDS)
    const expiresAtEpochSeconds = Math.floor(now / 1000) + ttlSeconds
    const username = `${expiresAtEpochSeconds}:${env.TURN_USERNAME || 'teaching-playground'}`
    const credential = createHmac('sha1', env.TURN_SHARED_SECRET).update(username).digest('base64')
    diagnostics.push(`Issued short-lived TURN credentials with ${ttlSeconds}s TTL.`)
    return {
      enabled: true,
      relayOnly,
      expiresAt: new Date(expiresAtEpochSeconds * 1000).toISOString(),
      rtcConfiguration: { iceServers: [{ urls, username, credential }] },
      diagnostics,
    }
  }

  if (env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    diagnostics.push('Using static TURN credentials from host environment.')
    return {
      enabled: true,
      relayOnly,
      rtcConfiguration: { iceServers: [{ urls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }] },
      diagnostics,
    }
  }

  diagnostics.push('TURN_URLS is configured, but TURN credentials are missing.')
  return {
    enabled: false,
    relayOnly,
    rtcConfiguration: { iceServers: [] },
    diagnostics,
  }
}
