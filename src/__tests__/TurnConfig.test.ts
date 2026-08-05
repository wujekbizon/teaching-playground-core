import { buildTurnConfiguration } from '../utils/TurnConfig'

describe('TURN configuration', () => {
  it('falls back to STUN diagnostics when TURN is not configured', () => {
    const config = buildTurnConfiguration({}, Date.parse('2026-08-04T00:00:00Z'))
    expect(config.enabled).toBe(false)
    expect(config.relayOnly).toBe(false)
    expect(config.rtcConfiguration.iceServers?.[0].urls).toBe('stun:stun.l.google.com:19302')
  })

  it('builds relay-only static TURN configuration', () => {
    const config = buildTurnConfiguration({
      TURN_URLS: 'turn:turn.example.com:3478, turns:turn.example.com:5349',
      TURN_USERNAME: 'teacher',
      TURN_CREDENTIAL: 'secret',
      TURN_FORCE_RELAY: 'true',
    })
    expect(config.enabled).toBe(true)
    expect(config.relayOnly).toBe(true)
    expect(config.rtcConfiguration.iceServers).toEqual([{ urls: ['turn:turn.example.com:3478', 'turns:turn.example.com:5349'], username: 'teacher', credential: 'secret' }])
  })

  it('issues bounded short-lived credentials when a shared secret is present', () => {
    const config = buildTurnConfiguration({
      TURN_URLS: 'turn:turn.example.com:3478',
      TURN_USERNAME: 'school-demo',
      TURN_SHARED_SECRET: 'relay-secret',
      TURN_TTL_SECONDS: '30',
    }, Date.parse('2026-08-04T00:00:00Z'))
    expect(config.enabled).toBe(true)
    expect(config.expiresAt).toBe('2026-08-04T00:01:00.000Z')
    const server = config.rtcConfiguration.iceServers?.[0] as RTCIceServer
    expect(server.username).toBe('1785801660:school-demo')
    expect(typeof server.credential).toBe('string')
  })
})
