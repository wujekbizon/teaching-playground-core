# Teaching Playground - Next Features Roadmap

**Current Version**: v1.4.4 (userId Fix + Database Optimization)
**Status**: Production Ready
**Last Updated**: 2025-11-09

---

## 📊 Current Status Assessment

### ✅ What's Completed in Production

**v1.4.4 - Critical Bug Fixes:**
- ✅ user_joined event includes userId field
- ✅ Database schema simplified (events + rooms only)
- ✅ JsonDatabase caching optimization (750× performance improvement)
- ✅ 173/174 tests passing (99.4%)

**v1.4.0 - Recording:**
- ✅ Client-side lecture recording (MediaRecorder API)
- ✅ Recording start/stop controls
- ✅ Recording notifications to participants
- ✅ Download recordings as WebM
- ✅ Duration tracking

**v1.3.1 - Participant Controls:**
- ✅ Mute all participants (teacher only)
- ✅ Mute individual participant (teacher only)
- ✅ Kick participant (teacher/admin only)
- ✅ Hand raise (students)
- ✅ Hand lower (students)
- ✅ Permission checks and validation

**v1.2.0 - WebRTC Core:**
- ✅ Video streaming (P2P WebRTC)
- ✅ Audio streaming
- ✅ Screen sharing
- ✅ 3 video layouts (Gallery, Speaker, Sidebar)
- ✅ Camera/mic controls
- ✅ Chat messaging
- ✅ Auto-reconnection
- ✅ Rate limiting

**Test Coverage:**
- ✅ 173/174 tests passing (99.4%)

---

## 🎯 Next Priorities (Medical Education Focus)

---

## 🏥 Phase 1: Breakout Rooms for Clinical Case Discussions

**Time Estimate:** 5-7 days
**Complexity:** Very High
**Value:** Critical for medical education
**Target Version:** v1.5.0

### Medical Education Use Cases

**1. Small Group Case Discussions**
- Split large lecture into 5-8 groups of 3-5 students
- Each group discusses a different clinical case
- Instructor rotates between rooms to provide guidance
- Groups present findings back to main room

**2. OSCE Practice Stations** (Objective Structured Clinical Examination)
- Multiple exam stations (history taking, physical exam, counseling)
- Students rotate through stations
- Instructor observes and scores performance
- Time-limited rounds (e.g., 7 minutes per station)

**3. Team-Based Learning (TBL)**
- Phase 1: Individual readiness assurance
- Phase 2: Team readiness in breakout rooms
- Phase 3: Application exercises in breakouts
- Phase 4: Report back to main room

**4. Simulation Debriefing**
- After simulation scenario, split into small groups for reflection
- Each group analyzes different aspects (clinical decisions, teamwork, etc.)
- Reconvene for large group discussion

### Core Features (Inspired by Zoom/Teams)

#### A. Breakout Room Creation & Management

**Package API Design:**
```typescript
// Create breakout rooms
connection.createBreakoutRooms({
  count: number;                    // Number of rooms (2-50)
  duration?: number;                // Auto-close timer in minutes
  assignmentType: 'manual' | 'automatic' | 'self-select';
  allowParticipantsToReturn?: boolean;  // Allow early return to main
  allowParticipantsToSwitch?: boolean;  // Allow room switching
})

// Assign participants
connection.assignToBreakoutRoom(roomId, userIds[])

// Move all to breakouts
connection.openAllBreakoutRooms()

// Close all breakouts and return to main
connection.closeAllBreakoutRooms()

// Broadcast message to all breakouts
connection.broadcastToBreakoutRooms(message)

// Move between breakout rooms (instructor only)
connection.joinBreakoutRoom(roomId)
connection.leaveBreakoutRoom()

// Events
connection.on('breakout_rooms_created', ({ rooms, assignments }) => {})
connection.on('assigned_to_breakout', ({ roomId, roomName, participants }) => {})
connection.on('breakout_opened', ({ roomId }) => {})
connection.on('breakout_closing_soon', ({ secondsRemaining }) => {})
connection.on('returned_to_main_room', () => {})
connection.on('instructor_joined_breakout', ({ instructorId }) => {})
connection.on('instructor_left_breakout', ({ instructorId }) => {})
```

#### B. Medical Education-Specific Features

**1. Role-Based Breakouts**
```typescript
// Assign roles within breakout rooms
connection.assignBreakoutRoles({
  roomId: 'breakout-1',
  roles: [
    { userId: 'student-1', role: 'team_leader' },
    { userId: 'student-2', role: 'scribe' },
    { userId: 'student-3', role: 'presenter' },
    { userId: 'patient-actor-1', role: 'standardized_patient' }
  ]
})

// Roles for medical education:
type BreakoutRole =
  | 'team_leader'          // Leads discussion
  | 'scribe'               // Takes notes
  | 'presenter'            // Reports back
  | 'timekeeper'           // Manages time
  | 'standardized_patient' // Simulated patient
  | 'observer'             // Watches only, can't speak
```

**2. Observation Mode (for Assessment)**
```typescript
// Instructor can observe without interrupting
connection.enterObservationMode(roomId)
// - Audio/video muted
// - Not visible to students
// - Can see/hear everything
// - Can take notes

connection.exitObservationMode()

// Trigger intervention if needed
connection.interruptBreakout(roomId, message)
```

**3. Case Distribution**
```typescript
// Assign different cases to different breakouts
connection.assignBreakoutResources({
  'breakout-1': {
    caseId: 'chest-pain-45yo',
    documents: ['ecg.pdf', 'labs.pdf'],
    timeLimit: 15
  },
  'breakout-2': {
    caseId: 'abdominal-pain-60yo',
    documents: ['ct-scan.pdf', 'history.pdf'],
    timeLimit: 15
  }
})
```

**4. Help Request System**
```typescript
// Student requests instructor help
connection.requestInstructorHelp(message?)

// Instructor sees queue
connection.on('help_requested', ({ roomId, studentId, message, timestamp }) => {
  // Show in help queue panel
})

// Instructor joins to help
connection.respondToHelpRequest(roomId)
```

**5. Breakout Timer with Warnings**
```typescript
connection.setBreakoutTimer({
  duration: 15,              // minutes
  warnings: [10, 5, 2, 1],   // Warn at 10, 5, 2, 1 minutes remaining
  autoClose: true            // Auto-close when time's up
})

connection.on('breakout_time_warning', ({ minutesRemaining }) => {
  // Show countdown
})

connection.on('breakout_time_expired', () => {
  // Auto-return to main room
})
```

**6. Pre-Assigned Groups (from Course Management)**
```typescript
// Assign based on pre-defined groups
connection.createBreakoutRooms({
  assignmentType: 'predefined',
  groups: [
    { name: 'Team A', studentIds: ['s1', 's2', 's3'] },
    { name: 'Team B', studentIds: ['s4', 's5', 's6'] },
    { name: 'Team C', studentIds: ['s7', 's8', 's9'] }
  ]
})
```

### Implementation Plan

**Phase 1: Core Breakout Infrastructure (3 days)**
1. Room hierarchy management (main room → breakout rooms)
2. Participant assignment and movement
3. WebSocket event handling for room transitions
4. State synchronization (who's in which room)

**Phase 2: Instructor Controls (2 days)**
5. Instructor dashboard showing all breakouts
6. Move between rooms functionality
7. Broadcast messaging
8. Close/open all controls

**Phase 3: Medical Education Features (2 days)**
9. Role assignment system
10. Observation mode
11. Help request queue
12. Timer with warnings

**Technical Challenges:**
- Each breakout room needs its own WebRTC mesh network
- Maintain connection to main room while in breakout
- Handle instructor simultaneously connected to multiple rooms
- Synchronize state across room hierarchy
- Performance with many concurrent rooms

---

## 🎓 Phase 2: Advanced Participant Management

**Time Estimate:** 4-6 days
**Complexity:** High
**Value:** Very High for medical education
**Target Version:** v1.5.0

### Medical Education Use Cases

**1. Clinical Skills Assessment**
- Observe students performing procedures
- Score performance using rubrics
- Provide real-time feedback
- Record sessions for review

**2. Standardized Patient Encounters**
- Manage patient actors in sessions
- Control audio/video for different roles
- Provide feedback without patient hearing

**3. Grand Rounds Presentations**
- Spotlight student presenters
- Manage Q&A sessions
- Control who can unmute
- Record presentations

### Core Features (Inspired by Zoom/Teams + Medical)

#### A. Advanced Video Controls

**Spotlight/Pin Management:**
```typescript
// Spotlight (everyone sees the same view)
connection.spotlightParticipant(userId)
connection.removeSpotlight()

// Co-spotlight (multiple people)
connection.addToSpotlight(userId)
connection.removeFromSpotlight(userId)

// Pin (personal view, doesn't affect others)
connection.pinParticipant(userId)
connection.unpinParticipant(userId)
```

**Medical Use Case:** During case presentation, spotlight the student presenter + chest X-ray screen share.

#### B. Waiting Room for Standardized Patients

```typescript
// Enable waiting room
connection.enableWaitingRoom({
  mode: 'selective',  // 'all' | 'selective' | 'disabled'
  autoAdmit: ['teacher', 'admin'],
  requireApproval: ['student', 'patient_actor']
})

// Admit from waiting room
connection.admitParticipant(userId)
connection.admitAll()

// Events
connection.on('participant_in_waiting_room', ({ userId, username, role }) => {
  // Show notification to instructor
})
```

**Medical Use Case:** Standardized patients wait in virtual "exam room" before student joins.

#### C. Advanced Permissions & Roles

```typescript
// Granular permissions
connection.setParticipantPermissions(userId, {
  canUnmuteSelf: boolean,
  canShareScreen: boolean,
  canEnableVideo: boolean,
  canChat: boolean,
  canRaiseHand: boolean,
  canViewOtherVideos: boolean,  // Blind assessment mode
  canRecordSession: boolean
})

// Role-based permissions
type ParticipantRole =
  | 'instructor'
  | 'teaching_assistant'
  | 'student'
  | 'standardized_patient'
  | 'observer'
  | 'guest'

connection.setParticipantRole(userId, role)
```

**Medical Use Case:** Observer can see/hear but not interact. Standardized patient can't see instructor feedback.

#### D. Polling & Quick Assessments

```typescript
// Create poll
connection.createPoll({
  question: 'What is the most likely diagnosis?',
  options: [
    'Myocardial Infarction',
    'Pulmonary Embolism',
    'Aortic Dissection',
    'Pneumothorax'
  ],
  allowMultiple: false,
  anonymous: true,
  timeLimit: 60  // seconds
})

// Launch poll
connection.launchPoll(pollId)

// End poll and show results
connection.endPoll(pollId, showResults: boolean)

// Events
connection.on('poll_started', ({ poll }) => {})
connection.on('poll_results', ({ pollId, results }) => {})
```

**Medical Use Case:** Quick formative assessment during lecture. "What test would you order next?"

#### E. Non-Verbal Feedback (Reactions)

```typescript
// Send reaction
connection.sendReaction(type: 'agree' | 'disagree' | 'confused' | 'slower' | 'faster')

// Events
connection.on('reaction_received', ({ userId, type, timestamp }) => {
  // Show floating emoji
})
```

**Medical Use Case:** Students can signal if pace is too fast without interrupting.

#### F. Session Recording Management

```typescript
// Enhanced recording controls
connection.startRecording({
  mode: 'speaker' | 'gallery' | 'screen-only' | 'active-speaker',
  layout: 'grid' | 'sidebar' | 'spotlight',
  includeChat: boolean,
  includeReactions: boolean,
  recordBreakouts: boolean,  // Record all breakouts simultaneously
  watermark?: {
    text: 'CONFIDENTIAL - Medical Education',
    position: 'bottom-right'
  }
})

// Pause/Resume recording (for breaks)
connection.pauseRecording()
connection.resumeRecording()

// Events
connection.on('recording_paused', () => {})
connection.on('recording_resumed', () => {})
```

**Medical Use Case:** Pause recording during sensitive discussions, resume for teaching content.

#### G. Focus Mode (Minimize Distractions)

```typescript
// Enable focus mode
connection.enableFocusMode({
  disableChat: true,
  disableReactions: true,
  disableVideoControls: true,  // Students can't change layout
  spotlightOnly: true,          // Only see spotlighted participant
  hideParticipantList: true
})

connection.disableFocusMode()
```

**Medical Use Case:** During high-stakes simulation or exam, minimize distractions.

#### H. Attendance Tracking & Reporting

```typescript
// Track attendance automatically
connection.on('participant_joined', ({ userId, timestamp }) => {
  // Log to database
})

connection.on('participant_left', ({ userId, timestamp, duration }) => {
  // Calculate attendance
})

// Generate attendance report
connection.getAttendanceReport(roomId): Promise<{
  participants: Array<{
    userId: string,
    username: string,
    joinTime: string,
    leaveTime: string,
    duration: number,  // seconds
    wasLate: boolean,
    leftEarly: boolean
  }>
}>
```

**Medical Use Case:** Automatic attendance for required lectures. Track who attended entire session.

#### I. Closed Captions / Transcription

```typescript
// Enable live transcription
connection.enableTranscription({
  language: 'en',
  saveTranscript: true,
  showLiveCaptions: true
})

// Events
connection.on('caption_available', ({ text, speaker, timestamp }) => {
  // Display caption
})

connection.on('transcript_ready', ({ url }) => {
  // Download full transcript
})
```

**Medical Use Case:** Accessibility for students with hearing impairments. Review exact wording after lecture.

---

## 📋 Medical Education Feature Comparison

### Zoom/Teams Features → Medical Adaptation

| Zoom/Teams Feature | Medical Education Adaptation | Priority |
|--------------------|------------------------------|----------|
| Breakout Rooms | ✅ Small group case discussions, OSCE stations | P0 |
| Polls | ✅ Formative assessments, audience response | P1 |
| Waiting Room | ✅ Standardized patient pre-session holding | P2 |
| Recording | ✅ Lecture capture, skills assessment review | P0 (Done v1.4.0) |
| Spotlight | ✅ Highlight student presenters, patient cases | P1 |
| Hand Raise | ✅ Student participation tracking | P0 (Done v1.3.1) |
| Reactions | ✅ Quick feedback without interrupting | P2 |
| Mute All | ✅ Classroom management | P0 (Done v1.3.1) |
| Screen Share | ✅ Medical imaging, EHR demos, slides | P0 (Done v1.2.0) |
| Chat | ✅ Questions, resource sharing | P0 (Done v1.2.0) |
| Live Transcription | ✅ Accessibility, lecture review | P3 |
| Whiteboard | ❌ **NEW:** Collaborative diagram drawing | P2 |
| Virtual Background | ❌ **Skip:** Not essential for medical ed | P4 |

### Medical-Specific Features (Not in Zoom/Teams)

| Feature | Description | Priority |
|---------|-------------|----------|
| **Role Assignment** | Assign clinical roles in simulations | P1 |
| **Observation Mode** | Silent instructor observation for assessment | P1 |
| **Help Queue** | Students request help during breakouts | P1 |
| **Case Distribution** | Auto-assign different cases to breakouts | P2 |
| **Blind Assessment** | Students can't see instructor/other students | P2 |
| **OSCE Timer** | Synchronized countdown for exam stations | P2 |
| **Clinical Scoring** | In-session performance rubric scoring | P3 |
| **Debrief Mode** | Structured post-simulation reflection | P3 |

---

## 🗺️ Implementation Roadmap

### v1.5.0 - Breakout Rooms & Advanced Management (4-6 weeks)

**Week 1-2: Breakout Rooms Core**
- ✅ Room hierarchy infrastructure
- ✅ Participant assignment
- ✅ Movement between rooms
- ✅ Timer system
- ✅ Help request queue

**Week 3: Medical-Specific Breakout Features**
- ✅ Role assignment
- ✅ Observation mode
- ✅ Case distribution
- ✅ Pre-defined groups

**Week 4: Advanced Participant Management**
- ✅ Spotlight/pin controls
- ✅ Waiting room
- ✅ Advanced permissions
- ✅ Polling system

**Week 5: Polish & Testing**
- ✅ UI/UX refinement
- ✅ Performance optimization
- ✅ Comprehensive testing
- ✅ Documentation

**Week 6: Optional Advanced Features**
- ⏳ Focus mode
- ⏳ Attendance tracking
- ⏳ Live transcription

### v1.6.0 - Clinical Assessment Tools (2-3 weeks)

- ✅ Structured scoring rubrics
- ✅ Blind assessment mode
- ✅ OSCE station rotation
- ✅ Automated timing and bells
- ✅ Performance data export

### v2.0.0 - AI-Enhanced Features (Future)

- 🤖 Automated attendance
- 🤖 Smart transcription with medical terms
- 🤖 Suggested diagnoses during cases
- 🤖 Automatic case difficulty assessment
- 🤖 Learning analytics dashboard

---

## ❓ Decision Points for Discussion

### 1. **Breakout Room Priority**
- **Question:** How critical are breakout rooms for your first deployment?
- **Options:**
  - **A:** Critical - delay v1.5.0 launch until breakouts ready
  - **B:** Nice-to-have - launch v1.5.0 without, add in v1.6.0
  - **C:** Essential - but can start with basic version

**My Recommendation:** Option C - Start with basic breakout rooms (create, assign, close), add advanced features iteratively.

### 2. **Most Valuable Medical Feature**
- **Question:** Which medical-specific feature provides most value?
- **Options:**
  - Breakout rooms for small group work
  - Observation mode for assessment
  - Polling for formative assessment
  - Waiting room for standardized patients

### 3. **Class Size Target**
- **Question:** What's typical class size?
- **Impact:**
  - 5-15 students → P2P mesh works fine
  - 15-30 students → Need optimization
  - 30+ students → Need SFU architecture

### 4. **Recording Enhancements Needed?**
- **Current:** Client-side recording (works well for single presenter)
- **Question:** Need to record:
  - Multiple students simultaneously?
  - Breakout room sessions?
  - Different layouts (grid vs spotlight)?

### 5. **Timeline Constraints**
- **Question:** When do you need breakout rooms in production?
- **Options:**
  - Next semester (flexible timeline)
  - Next month (need MVP quickly)
  - Next week (urgent need)

---

## 🎯 Recommended Next Steps

### Immediate (This Week):

**1. Review & Decide on Priorities**
- Which features are must-have vs nice-to-have?
- What's the target launch date?
- What's the MVP for breakout rooms?

**2. Test Current v1.4.4 in Real Scenario**
- Run actual lecture with students
- Test recording functionality
- Verify participant controls work
- Identify pain points

**3. Gather User Feedback**
- What do teachers need most?
- What frustrates students?
- Which Zoom features do they miss?

### Next 2 Weeks:

**4. Start Breakout Rooms MVP**
- Basic create/assign/close functionality
- Simple timer system
- Instructor movement between rooms

**5. Design UI/UX for Breakouts**
- Mockups for breakout creation
- Participant assignment interface
- Breakout monitoring dashboard

**6. Plan Database Schema**
- Breakout room persistence
- Participant assignment tracking
- Session analytics

---

## 📞 Let's Discuss

**I want to understand:**

1. **Your teaching scenarios** - Walk me through a typical medical education session. What happens step-by-step?

2. **Current pain points** - What features from Zoom/Teams do your instructors wish they had?

3. **Student workflow** - What's confusing for students in current system?

4. **Assessment needs** - How do instructors evaluate student performance during sessions?

5. **Priority ranking** - If you could only have 3 new features, which would they be?

**Based on your answers, I'll refine this roadmap and create a detailed implementation plan for the next phase.**

**Ready to discuss? 🎓**
