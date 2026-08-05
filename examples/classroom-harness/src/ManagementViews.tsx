import { FormEvent, useCallback, useEffect, useState } from 'react'

type Features = { hasVideo: boolean; hasAudio: boolean; hasChat: boolean; hasWhiteboard: boolean; hasScreenShare: boolean }
type Room = { id: string; name: string; capacity: number; status: string; features: Features }
type AcademicPath = { programId: string; curriculumId: string; termId: string; courseId: string; subjectId: string; cohortId: string }
type Reservation = { id: string; roomId: string; name: string; teacherId: string; startsAt: string; endsAt: string; timezone: string; capacity: number; status: string; academicPath?: AcademicPath }

const request = async <T,>(serverUrl: string, path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`${serverUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const contentType = response.headers.get('content-type') ?? ''
  const body = contentType.includes('application/json') ? await response.json() : await response.text()
  if (!response.ok) {
    const message = typeof body === 'object' && body && 'message' in body
      ? String(body.message)
      : `Request failed (${response.status})${typeof body === 'string' && body ? `: ${body}` : ''}`
    throw new Error(message)
  }
  if (!contentType.includes('application/json')) {
    throw new Error(`Expected JSON from ${path}, but received ${contentType || 'an unknown content type'}. Is the DEV_AUTH_ENABLED=true server running?`)
  }
  return body as T
}

export function ManagementViews({ view, setView, serverUrl, onJoinReservation }: {
  view: 'rooms' | 'schedule'; setView: (view: 'rooms' | 'schedule' | 'live') => void; serverUrl: string;
  onJoinReservation?: (reservation: Reservation) => void
}) {
  const [rooms, setRooms] = useState<Room[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [capacityFilter, setCapacityFilter] = useState(0)
  const [roomName, setRoomName] = useState('')
  const [roomCapacity, setRoomCapacity] = useState(30)
  const [lectureName, setLectureName] = useState('')
  const [selectedRoom, setSelectedRoom] = useState('')
  const [startsAt, setStartsAt] = useState('2026-09-01T10:00')
  const [endsAt, setEndsAt] = useState('2026-09-01T11:00')
  const [availableRoomIds, setAvailableRoomIds] = useState<string[] | null>(null)
  const [availabilityMessage, setAvailabilityMessage] = useState('Choose an interval and search to select a room.')
  const [searchingAvailability, setSearchingAvailability] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [academicPath, setAcademicPath] = useState<AcademicPath>({
    programId: 'medical-assistant', curriculumId: 'medical-assistant-2026', termId: 'fall-2026',
    courseId: 'semester-1', subjectId: 'anatomy', cohortId: 'group-a',
  })

  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const [nextRooms, nextReservations] = await Promise.all([
        request<Room[]>(serverUrl, '/api/rooms'), request<Reservation[]>(serverUrl, '/api/reservations'),
      ])
      setRooms(nextRooms); setReservations(nextReservations)
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
    finally { setLoading(false) }
  }, [serverUrl])

  useEffect(() => { void refresh() }, [refresh])

  const createRoom = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    try {
      await request(serverUrl, '/api/rooms', { method: 'POST', body: JSON.stringify({ name: roomName, capacity: roomCapacity }) })
      setRoomName(''); await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const schedule = async (event: FormEvent) => {
    event.preventDefault(); setError('')
    try {
      const payload = {
        name: lectureName, roomId: selectedRoom, startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        capacity: roomCapacity, academicPath,
      }
      if (editingId) await request(serverUrl, `/api/reservations/${editingId}/reschedule`, { method: 'POST', body: JSON.stringify({ roomId: payload.roomId, startsAt: payload.startsAt, endsAt: payload.endsAt }) })
      else await request(serverUrl, '/api/reservations', { method: 'POST', body: JSON.stringify(payload) })
      setLectureName(''); setEditingId(null); await refresh()
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const updateAcademicPath = (key: keyof AcademicPath, value: string) => setAcademicPath(current => ({ ...current, [key]: value }))

  const cancel = async (id: string) => {
    try { await request(serverUrl, `/api/reservations/${id}/cancel`, { method: 'POST' }); await refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }
  const editReservation = (item: Reservation) => {
    setEditingId(item.id); setLectureName(item.name); setSelectedRoom(item.roomId)
    setStartsAt(item.startsAt.slice(0, 16)); setEndsAt(item.endsAt.slice(0, 16)); setAvailableRoomIds(null)
    if (item.academicPath) setAcademicPath(item.academicPath)
  }
  const toggleMaintenance = async (room: Room) => {
    try { await request(serverUrl, `/api/rooms/${room.id}/maintenance`, { method: 'POST', body: JSON.stringify({ enabled: room.status !== 'maintenance' }) }); await refresh() }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)) }
  }

  const searchAvailability = async () => {
    setError('')
    const start = new Date(startsAt)
    const end = new Date(endsAt)
    if (!startsAt || !endsAt || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
      setAvailableRoomIds([]); setAvailabilityMessage('Enter a valid interval with the end after the start.')
      return
    }
    setSearchingAvailability(true); setAvailabilityMessage('Searching available rooms…')
    try {
      const query = new URLSearchParams({ startsAt: start.toISOString(),
        endsAt: end.toISOString(), capacity: String(roomCapacity) })
      if (editingId) query.set('excludeReservationId', editingId)
      const available = await request<Room[]>(serverUrl, `/api/availability?${query}`)
      setAvailableRoomIds(available.map(room => room.id))
      if (available[0]) {
        setSelectedRoom(available[0].id)
        setAvailabilityMessage(`${available.length} available ${available.length === 1 ? 'room' : 'rooms'} found. Select one below.`)
      } else {
        setSelectedRoom(''); setAvailabilityMessage('No room is available for this interval and capacity.')
      }
    } catch (reason) {
      setAvailableRoomIds(null); setAvailabilityMessage('Availability search failed. Correct the error and try again.')
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally { setSearchingAvailability(false) }
  }

  const resetAvailability = () => {
    setAvailableRoomIds(null); setSelectedRoom('')
    setAvailabilityMessage('Search again after changing the interval or capacity.')
  }

  const visibleRooms = rooms.filter(room => room.capacity >= capacityFilter)
  return <div className="management-shell">
    <header className="management-header">
      <div className="brand"><span className="brand-mark">TP</span><div><strong>Teaching Playground</strong><small>Scheduling harness</small></div></div>
      <nav aria-label="Primary navigation"><button className={view === 'rooms' ? 'active' : ''} onClick={() => setView('rooms')}>Rooms</button><button className={view === 'schedule' ? 'active' : ''} onClick={() => setView('schedule')}>Schedule</button><button onClick={() => setView('live')}>Live classroom</button></nav>
      <div className="org-chip"><small>Organization</small><strong>Demo School</strong><span>school-demo · UTC payloads</span></div>
    </header>
    <main className="management-main">
      <div className="page-title"><div><span className="eyebrow">Organization workspace</span><h1>{view === 'rooms' ? 'Rooms' : 'Lecture schedule'}</h1></div><button className="secondary compact" onClick={() => void refresh()}>Refresh</button></div>
      {error && <div className="management-error" role="alert">{error}</div>}
      {loading ? <div className="management-empty">Loading organization data…</div> : view === 'rooms' ? <>
        <section className="management-toolbar"><label>Minimum capacity<input type="number" min="0" value={capacityFilter} onChange={event => setCapacityFilter(Number(event.target.value))} /></label><span>{visibleRooms.length} rooms</span></section>
        <div className="management-grid">
          <section className="catalog"><h2>Room catalog</h2>{visibleRooms.length === 0 ? <div className="management-empty">No rooms match this filter.</div> : visibleRooms.map(room => <article className="room-row" key={room.id}><div><strong>{room.name}</strong><small>{room.id}</small></div><span>{room.capacity} seats</span><span className={`status ${room.status}`}>{room.status}</span><div className="feature-list">{Object.entries(room.features).filter(([, enabled]) => enabled).map(([feature]) => <em key={feature}>{feature.replace('has', '')}</em>)}</div><button className="row-action" onClick={() => void toggleMaintenance(room)}>{room.status === 'maintenance' ? 'Restore' : 'Maintenance'}</button></article>)}</section>
          <form className="management-form" onSubmit={createRoom}><h2>Create room</h2><label>Name<input required minLength={3} value={roomName} onChange={event => setRoomName(event.target.value)} /></label><label>Capacity<input required type="number" min="1" value={roomCapacity} onChange={event => setRoomCapacity(Number(event.target.value))} /></label><button className="primary">Create room</button></form>
        </div>
      </> : <div className="management-grid">
        <section className="catalog"><h2>Upcoming reservations</h2>{reservations.length === 0 ? <div className="management-empty">No lectures scheduled.</div> : reservations.map(item => <article className="reservation-row" key={item.id}><div><strong>{item.name}</strong><small>{new Date(item.startsAt).toLocaleString()} – {new Date(item.endsAt).toLocaleTimeString()}</small></div><span>{rooms.find(room => room.id === item.roomId)?.name ?? item.roomId}</span><span>{item.academicPath ? `${item.academicPath.termId} / ${item.academicPath.subjectId} / ${item.academicPath.cohortId}` : 'No academic path'}</span><span className={`status ${item.status}`}>{item.status}</span>{item.status !== 'cancelled' && <div className="reservation-actions"><button onClick={() => editReservation(item)}>Reschedule</button><button onClick={() => void cancel(item.id)}>Cancel</button>{(item.status === 'open' || item.status === 'in-progress') && <button onClick={() => onJoinReservation?.(item)}>Join live</button>}</div>}</article>)}</section>
        <form className="management-form" onSubmit={schedule}><h2>{editingId ? 'Reschedule lecture' : 'Schedule lecture'}</h2><div className="schedule-policy">A 15-minute empty-room turnover is required between lectures.</div><label>Subject / name<input required minLength={3} disabled={editingId !== null} value={lectureName} onChange={event => setLectureName(event.target.value)} /></label><fieldset className="academic-path" disabled={editingId !== null}><legend>Normalized academic path</legend><label>Program ID<input required value={academicPath.programId} onChange={event => updateAcademicPath('programId', event.target.value)} /></label><label>Curriculum ID<input required value={academicPath.curriculumId} onChange={event => updateAcademicPath('curriculumId', event.target.value)} /></label><label>Term ID<input required value={academicPath.termId} onChange={event => updateAcademicPath('termId', event.target.value)} /></label><label>Course ID<input required value={academicPath.courseId} onChange={event => updateAcademicPath('courseId', event.target.value)} /></label><label>Subject ID<input required value={academicPath.subjectId} onChange={event => updateAcademicPath('subjectId', event.target.value)} /></label><label>Cohort ID<input required value={academicPath.cohortId} onChange={event => updateAcademicPath('cohortId', event.target.value)} /></label></fieldset><label>Starts<input required type="datetime-local" value={startsAt} onChange={event => { setStartsAt(event.target.value); resetAvailability() }} /></label><label>Ends<input required type="datetime-local" value={endsAt} onChange={event => { setEndsAt(event.target.value); resetAvailability() }} /></label><label>Capacity<input required type="number" min="1" disabled={editingId !== null} value={roomCapacity} onChange={event => { setRoomCapacity(Number(event.target.value)); resetAvailability() }} /></label><button type="button" className="secondary availability-button" disabled={searchingAvailability || roomCapacity < 1 || !startsAt || !endsAt} onClick={() => void searchAvailability()}>{searchingAvailability ? 'Searching…' : 'Search available rooms'}</button><div className={`availability-result ${availableRoomIds?.length ? 'success' : ''}`} role="status">{availabilityMessage}</div><label>Available room<select required disabled={availableRoomIds === null || availableRoomIds.length === 0} value={selectedRoom} onChange={event => setSelectedRoom(event.target.value)}><option value="">Select an available room</option>{rooms.filter(room => availableRoomIds?.includes(room.id)).map(room => <option key={room.id} value={room.id}>{room.name} · {room.capacity} seats</option>)}</select></label><button className="primary" disabled={!selectedRoom || !availableRoomIds?.includes(selectedRoom)}>{editingId ? 'Save new time' : 'Schedule lecture'}</button>{editingId && <button type="button" className="secondary" onClick={() => { setEditingId(null); setLectureName(''); resetAvailability() }}>Discard changes</button>}</form>
      </div>}
    </main>
  </div>
}
