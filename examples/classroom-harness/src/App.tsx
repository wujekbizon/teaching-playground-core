import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { RoomConnection } from '@teaching-playground/core/room-connection'
import type { User } from '@teaching-playground/core/user'

type Participant = User & {
  userId?: string
  socketId: string
  handRaised?: boolean
  isStreaming?: boolean
}

type LogEntry = {
  id: number
  time: string
  direction: 'in' | 'out' | 'system'
  event: string
  detail: string
}

const eventNames = [
  'welcome', 'room_state', 'message_history', 'message_received', 'user_joined',
  'user_left', 'remote_stream_added', 'stream_started', 'stream_stopped',
  'hand_raised', 'hand_lowered', 'mute_all', 'muted_by_teacher',
  'participant_kicked', 'kicked_from_room', 'room_cleared', 'room_closed',
  'join_room_error', 'connection_error', 'webrtc_error',
  'lecture_recording_started', 'lecture_recording_stopped', 'error',
]

const stringify = (value: unknown) => {
  if (value instanceof Error) return value.message
  try { return JSON.stringify(value) } catch { return String(value) }
}

export default function App() {
  const [serverUrl, setServerUrl] = useState('http://localhost:3001')
  const [roomId, setRoomId] = useState('clinical-skills-101')
  const [token, setToken] = useState('teacher:Dr. Maya Chen')
  const [syncDevelopmentToken, setSyncDevelopmentToken] = useState(true)
  const [name, setName] = useState('Dr. Maya Chen')
  const [role, setRole] = useState<User['role']>('teacher')
  const [connected, setConnected] = useState(false)
  const [localSocketId, setLocalSocketId] = useState<string | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [messages, setMessages] = useState<Array<{ messageId: string; username: string; content: string; timestamp: string }>>([])
  const [message, setMessage] = useState('')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map())
  const [micOn, setMicOn] = useState(true)
  const [cameraOn, setCameraOn] = useState(true)
  const [sharing, setSharing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [handRaised, setHandRaised] = useState(false)
  const [notice, setNotice] = useState<{ tone: 'info' | 'error'; text: string } | null>(null)
  const [panel, setPanel] = useState<'chat' | 'events'>('chat')
  const connectionRef = useRef<RoomConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const logId = useRef(0)

  const user: User = {
    id: `${role}-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'user'}`,
    username: name,
    displayName: name,
    role,
    status: 'online',
  }

  const addLog = useCallback((direction: LogEntry['direction'], event: string, payload?: unknown) => {
    setLogs(current => [{
      id: ++logId.current,
      time: new Date().toLocaleTimeString([], { hour12: false }),
      direction,
      event,
      detail: payload === undefined ? '' : stringify(payload),
    }, ...current].slice(0, 100))
  }, [])

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStream
  }, [localStream])

  useEffect(() => {
    if (!recording) { setRecordingSeconds(0); return }
    const timer = window.setInterval(() => setRecordingSeconds(value => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [recording])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => () => {
    connectionRef.current?.disconnect()
    localStreamRef.current?.getTracks().forEach(track => track.stop())
  }, [])

  const ensureMedia = async () => {
    if (localStream) return localStream
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    localStreamRef.current = stream
    setLocalStream(stream)
    addLog('system', 'media_ready', { tracks: stream.getTracks().map(track => track.kind) })
    return stream
  }

  const connect = async (withMedia = true) => {
    if (connectionRef.current) return
    try {
      const stream = withMedia ? await ensureMedia() : null
      const connection = new RoomConnection(roomId, user, serverUrl, { auth: { token } })
      connectionRef.current = connection

      eventNames.forEach(event => connection.on(event, (payload: unknown) => addLog('in', event, payload)))
      connection.on('connected', () => {
        setConnected(true)
        setLocalSocketId(connection.getSocketId() ?? null)
        if (stream) {
          void connection.startStream(stream).catch(error => addLog('system', 'stream_failed', error))
        }
      })
      connection.on('disconnected', () => setConnected(false))
      connection.on('room_state', ({ participants: roomParticipants }: { participants: Participant[] }) => {
        setParticipants(roomParticipants)
      })
      connection.on('user_joined', (participant: Participant) => {
        const normalized = { ...participant, id: participant.userId ?? participant.id }
        setParticipants(current => [...current.filter(item => item.id !== normalized.id), normalized])
      })
      connection.on('user_left', (participant: Participant) => {
        setParticipants(current => current.filter(item => item.socketId !== participant.socketId))
        setRemoteStreams(current => {
          const next = new Map(current); next.delete(participant.socketId); return next
        })
      })
      connection.on('message_history', (history: typeof messages) => {
        setMessages(current => [...new Map(
          [...history, ...current].map(item => [item.messageId, item]),
        ).values()])
      })
      connection.on('message_received', (incoming: (typeof messages)[number]) => {
        setMessages(current => current.some(item => item.messageId === incoming.messageId)
          ? current
          : [...current, incoming])
      })
      connection.on('remote_stream_added', ({ peerId, stream: remote }: { peerId: string; stream: MediaStream }) => {
        setRemoteStreams(current => new Map(current).set(peerId, remote))
      })
      connection.on('remote_stream_removed', ({ peerId }: { peerId: string }) => {
        setRemoteStreams(current => { const next = new Map(current); next.delete(peerId); return next })
      })
      connection.on('hand_raised', ({ userId }: { userId: string }) => setParticipants(current => current.map(item => item.id === userId ? { ...item, handRaised: true } : item)))
      connection.on('hand_lowered', ({ userId }: { userId: string }) => setParticipants(current => current.map(item => item.id === userId ? { ...item, handRaised: false } : item)))
      connection.on('mute_all', () => forceMute('The instructor muted the classroom.'))
      connection.on('muted_by_teacher', () => forceMute('You were muted by the instructor.'))
      connection.on('kicked_from_room', ({ reason }: { reason: string }) => {
        setNotice({ tone: 'error', text: `You were removed: ${reason}` })
        resetSession()
      })
      connection.on('participant_kicked', ({ userId }: { userId: string }) => {
        setParticipants(current => current.filter(item => item.id !== userId))
      })
      connection.on('join_room_error', (error: unknown) => {
        setNotice({ tone: 'error', text: `Could not join: ${stringify(error)}` })
        resetSession()
      })
      connection.on('recording_stopped', ({ blob }: { blob: Blob }) => {
        const link = document.createElement('a')
        link.href = URL.createObjectURL(blob)
        link.download = `${roomId}-${Date.now()}.webm`
        link.click()
        URL.revokeObjectURL(link.href)
        setRecording(false)
      })
      connection.connect()
      addLog('out', 'connect', { roomId, role, serverUrl })
    } catch (error) {
      addLog('system', 'connect_failed', error)
      setNotice({ tone: 'error', text: `Unable to connect: ${stringify(error)}` })
    }
  }

  const resetSession = () => {
    const connection = connectionRef.current
    if (connection?.isScreenSharing()) connection.stopScreenShare()
    if (connection?.isRecording()) {
      try { connection.stopRecording() } catch { /* connection cleanup continues */ }
    }
    connection?.disconnect()
    connectionRef.current = null
    localStreamRef.current?.getTracks().forEach(track => track.stop())
    localStreamRef.current = null
    setLocalStream(null)
    setConnected(false)
    setLocalSocketId(null)
    setParticipants([])
    setMessages([])
    setRemoteStreams(new Map())
    setSharing(false)
    setRecording(false)
    setHandRaised(false)
    setMicOn(true)
    setCameraOn(true)
  }

  const forceMute = (text: string) => {
    localStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = false })
    setMicOn(false)
    setNotice({ tone: 'info', text })
  }

  const disconnect = () => {
    resetSession()
    addLog('out', 'disconnect')
  }

  const toggleTrack = (kind: 'audio' | 'video') => {
    const track = localStream?.getTracks().find(item => item.kind === kind)
    if (!track) {
      void ensureMedia().then(stream => {
        if (connected) void connectionRef.current?.startStream(stream)
      }).catch(error => setNotice({ tone: 'error', text: `Media unavailable: ${stringify(error)}` }))
      return
    }
    track.enabled = !track.enabled
    kind === 'audio' ? setMicOn(track.enabled) : setCameraOn(track.enabled)
    addLog('system', `${kind}_${track.enabled ? 'enabled' : 'disabled'}`)
  }

  const toggleScreen = async () => {
    const connection = connectionRef.current
    if (!connection) return
    try {
      if (sharing) { connection.stopScreenShare(); setSharing(false) }
      else {
        const stream = await connection.startScreenShare()
        setSharing(true)
        stream.getVideoTracks()[0]?.addEventListener('ended', () => setSharing(false), { once: true })
      }
    } catch (error) { setNotice({ tone: 'error', text: `Screen share failed: ${stringify(error)}` }) }
  }

  const toggleRecording = async () => {
    const connection = connectionRef.current
    if (!connection || !localStream) return
    try {
      if (recording) connection.stopRecording()
      else { await connection.startRecording(localStream); setRecording(true) }
    } catch (error) { setNotice({ tone: 'error', text: `Recording failed: ${stringify(error)}` }) }
  }

  const toggleHand = () => {
    if (!connectionRef.current || !connected) return
    if (handRaised) connectionRef.current.lowerHand()
    else connectionRef.current.raiseHand()
    setHandRaised(!handRaised)
    addLog('out', handRaised ? 'lower_hand' : 'raise_hand')
  }

  const kick = (participant: Participant) => {
    if (!window.confirm(`Remove ${participant.displayName ?? participant.username} from the classroom?`)) return
    connectionRef.current?.kickParticipant(participant.id, 'Removed by instructor')
  }

  const sendMessage = (event: FormEvent) => {
    event.preventDefault()
    if (!message.trim() || !connectionRef.current) return
    connectionRef.current.sendMessage(message.trim())
    addLog('out', 'send_message', { content: message.trim() })
    setMessage('')
  }

  const participantCount = Math.max(participants.length, connected ? 1 : 0)

  return <div className="app-shell">
    {notice && <div className={`notice ${notice.tone}`} role="status">{notice.text}<button onClick={() => setNotice(null)}>×</button></div>}
    <header className="topbar">
      <div className="brand"><span className="brand-mark">TP</span><div><strong>Teaching Playground</strong><small>Classroom harness</small></div></div>
      <div className={`connection-pill ${connected ? 'online' : ''}`}><span />{connected ? 'Live session' : 'Not connected'}</div>
      <div className="session-code">Room <strong>{roomId}</strong></div>
      <button className="avatar" title={name}>{name.split(' ').map(part => part[0]).slice(0, 2).join('')}</button>
    </header>

    <main className="workspace">
      <aside className="setup-card">
        <div className="eyebrow">Session setup</div>
        <h1>Join a classroom</h1>
        <p>Test authenticated media and classroom events using the public package API.</p>
        <label>Server URL<input value={serverUrl} onChange={event => setServerUrl(event.target.value)} disabled={connected} /></label>
        <label>Room ID<input value={roomId} onChange={event => setRoomId(event.target.value)} disabled={connected} /></label>
        <label>Display name<input value={name} onChange={event => {
          const nextName = event.target.value
          setName(nextName)
          if (syncDevelopmentToken) setToken(`${role}:${nextName}`)
        }} disabled={connected} /></label>
        <div className="field-row">
          <label>Role<select value={role} onChange={event => {
            const nextRole = event.target.value as User['role']
            setRole(nextRole)
            if (syncDevelopmentToken) setToken(`${nextRole}:${name}`)
          }} disabled={connected}><option value="teacher">Teacher</option><option value="student">Student</option><option value="admin">Admin</option></select></label>
          <label>Auth token<input value={token} onChange={event => { setToken(event.target.value); setSyncDevelopmentToken(false) }} type="password" disabled={connected} /></label>
        </div>
        <div className="auth-hint">The development server trusts the <code>role:name</code> token as the participant identity.<button type="button" disabled={connected} onClick={() => { setToken(`${role}:${name}`); setSyncDevelopmentToken(true) }}>Use display name</button></div>
        <button className={`primary ${connected ? 'danger' : ''}`} onClick={() => connected ? disconnect() : void connect(true)}>{connected ? 'Leave classroom' : 'Join with camera'}</button>
        {!connected && <button className="secondary" onClick={() => void connect(false)}>Join without media</button>}
        <div className="setup-note"><span>i</span><p>Open a second tab with another role to test peer media and participant controls.</p></div>
      </aside>

      <section className="stage">
        <div className="stage-heading"><div><span className="eyebrow">Clinical skills · Live lab</span><h2>Patient communication workshop</h2></div><span className="participant-count">{participantCount} {participantCount === 1 ? 'participant' : 'participants'}</span></div>
        <div className="video-grid">
          <article className="video-card local"><video ref={localVideoRef} autoPlay muted playsInline /><div className="video-placeholder"><div className="large-avatar">{name.split(' ').map(part => part[0]).slice(0, 2).join('')}</div><span>{cameraOn && localStream ? 'Camera preview' : 'Camera is off'}</span></div><div className="video-label"><span>{name} <em>You</em></span><span>{micOn ? 'Mic on' : 'Muted'}</span></div></article>
          {[...remoteStreams.entries()].map(([peerId, stream]) => <RemoteVideo key={peerId} peerId={peerId} stream={stream} participant={participants.find(item => item.socketId === peerId)} />)}
          {remoteStreams.size === 0 && <article className="video-card empty"><div className="empty-ring">+</div><strong>Waiting for another participant</strong><span>Open this harness in a second tab</span></article>}
        </div>
        <div className="media-bar">
          <button disabled={!connected} onClick={() => toggleTrack('audio')} className={!micOn ? 'active-off' : ''}><span>{micOn ? '●' : '×'}</span>{micOn ? 'Mute' : 'Unmute'}</button>
          <button disabled={!connected} onClick={() => toggleTrack('video')} className={!cameraOn ? 'active-off' : ''}><span>▣</span>{cameraOn ? 'Camera' : 'Start camera'}</button>
          <button disabled={!connected} onClick={() => void toggleScreen()} className={sharing ? 'selected' : ''}><span>↗</span>{sharing ? 'Stop sharing' : 'Share screen'}</button>
          {role !== 'student' && <button disabled={!connected || !localStream} onClick={() => void toggleRecording()} className={recording ? 'recording' : ''}><span>●</span>{recording ? `Stop · ${recordingSeconds}s` : 'Record'}</button>}
          <button disabled={!connected} onClick={toggleHand} className={handRaised ? 'selected' : ''}><span>✋</span>{handRaised ? 'Lower hand' : 'Raise hand'}</button>
        </div>
      </section>

      <aside className="side-panel">
        <div className="tabs"><button className={panel === 'chat' ? 'active' : ''} onClick={() => setPanel('chat')}>Chat</button><button className={panel === 'events' ? 'active' : ''} onClick={() => setPanel('events')}>Events <span>{logs.length}</span></button></div>
        {panel === 'chat' ? <>
          <div className="participant-strip"><div className="people-heading"><strong>People</strong>{role !== 'student' && connected && <button onClick={() => connectionRef.current?.muteAllParticipants()}>Mute all</button>}</div>{participants.length === 0 && <small className="no-people">Participants appear after you join.</small>}{participants.map(item => <div className="person" key={item.socketId}><span>{(item.displayName ?? item.username)[0]}</span><div><b>{item.displayName ?? item.username}</b><small>{item.role}{item.handRaised ? ' · ✋ Hand raised' : ''}</small></div>{role !== 'student' && item.socketId !== localSocketId && <div className="person-actions"><button onClick={() => connectionRef.current?.muteParticipant(item.id)}>Mute</button><button className="remove" onClick={() => kick(item)}>Remove</button></div>}</div>)}</div>
          <div className="chat-feed">{messages.length === 0 ? <div className="blank-state"><span>•••</span><strong>No messages yet</strong><p>Messages and history will appear here.</p></div> : messages.map(item => <div className="chat-message" key={item.messageId}><div><strong>{item.username}</strong><time>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div><p>{item.content}</p></div>)}</div>
          <form className="composer" onSubmit={sendMessage}><input disabled={!connected} value={message} onChange={event => setMessage(event.target.value)} placeholder={connected ? 'Message the classroom…' : 'Join to send a message'} /><button disabled={!connected || !message.trim()} aria-label="Send message">↑</button></form>
        </> : <div className="event-feed">{logs.length === 0 ? <div className="blank-state"><strong>No events captured</strong><p>Connect to begin inspecting events.</p></div> : logs.map(log => <div className="event-row" key={log.id}><span className={log.direction}>{log.direction === 'in' ? '←' : log.direction === 'out' ? '→' : '·'}</span><div><b>{log.event}</b><small>{log.detail}</small></div><time>{log.time}</time></div>)}</div>}
      </aside>
    </main>
  </div>
}

function RemoteVideo({ peerId, stream, participant }: { peerId: string; stream: MediaStream; participant?: Participant }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (ref.current) ref.current.srcObject = stream }, [stream])
  return <article className="video-card"><video ref={ref} autoPlay playsInline /><div className="video-label"><span>{participant?.displayName ?? participant?.username ?? peerId.slice(0, 8)}</span><span>{participant?.handRaised ? 'Hand raised' : 'Connected'}</span></div></article>
}
