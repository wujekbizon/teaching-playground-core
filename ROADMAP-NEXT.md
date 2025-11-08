# Teaching Playground - Next Features Roadmap

**Current Version**: v1.2.0 (WebRTC Media Streaming)
**Status**: Production Ready, All Tests Passing
**Planning Date**: 2025-11-08

---

## 📊 Current Status Assessment

### ✅ What's Working in Production

**Frontend Implementation:**
- ✅ Video streaming (P2P WebRTC)
- ✅ Audio streaming
- ✅ Screen sharing (v1.3.0)
- ✅ 3 video layouts (Gallery, Speaker, Sidebar)
- ✅ Camera/mic controls
- ✅ Chat messaging
- ✅ Room cleanup notifications
- ✅ Participant list

**Package Features Available:**
- ✅ WebRTC peer connections (v1.2.0)
- ✅ Screen sharing (v1.3.0)
- ✅ Room cleanup (v1.1.3)
- ✅ Message history
- ✅ Rate limiting
- ✅ Auto-reconnection
- ✅ Graceful shutdown

**Test Coverage:**
- ✅ 73/73 tests passing (100%)
- ✅ WebRTC integration tested
- ✅ Screen sharing tested
- ✅ Room cleanup tested

---

## 🎯 Immediate Priorities (Polish & Stabilize)

### Priority 1: Multi-User Testing & Validation
**Time Estimate:** 2-3 hours
**Complexity:** Low
**Value:** Critical - ensures current features work

**Tasks:**
1. Test with 2-3 simultaneous participants
2. Verify video/audio sync between peers
3. Test screen sharing with multiple viewers
4. Validate chat works with multiple users
5. Test connection stability under network changes

**Why First:** Need to validate current implementation works before adding more features

**Package Support:** Already exists, just needs testing

---

### Priority 2: Connection Quality Indicators
**Time Estimate:** 3-4 hours
**Complexity:** Medium
**Value:** High - improves user experience

**What It Does:**
- Shows connection quality for each participant (excellent/good/poor)
- Real-time network health monitoring
- Visual indicators (colored dots in VideoTile)

**Package API Needed:**
```typescript
// Package would provide:
connection.getConnectionStats(peerId): Promise<RTCStatsReport>

// Or new event:
connection.on('connection_quality_changed', ({ peerId, quality }) => {
  // quality: 'excellent' | 'good' | 'poor' | 'disconnected'
})
```

**Frontend Tasks:**
1. Wire up RTCPeerConnection.getStats() API
2. Calculate quality metrics (packet loss, jitter, RTT)
3. Update VideoTile connection quality dots
4. Show warnings for poor connections

**Implementation Notes:**
- Use existing RTCPeerConnection.getStats() browser API
- Poll every 2-5 seconds for stats
- Thresholds: excellent (<50ms RTT), good (<150ms), poor (>150ms)

---

### Priority 3: Better Error Handling
**Time Estimate:** 4-5 hours
**Complexity:** Medium
**Value:** High - prevents user frustration

**Scenarios to Handle:**

1. **Camera/Mic Permission Denied**
   ```typescript
   // Show friendly message
   "Camera access denied. Please allow camera access in your browser settings."
   ```

2. **Connection Lost**
   ```typescript
   connection.on('disconnected', () => {
     showToast('Connection lost. Attempting to reconnect...')
   })

   connection.on('reconnecting', (attempt) => {
     showToast(`Reconnecting... (attempt ${attempt}/5)`)
   })

   connection.on('reconnected', () => {
     showToast('Successfully reconnected!')
   })
   ```

3. **Network Quality Warnings**
   ```typescript
   connection.on('poor_network_quality', () => {
     showWarning('Poor network connection. Video quality may be reduced.')
   })
   ```

4. **Peer Connection Failed**
   ```typescript
   connection.on('peer_connection_failed', ({ peerId }) => {
     showError(`Cannot connect to participant ${peerId}`)
   })
   ```

**Package Support:**
- Most events already exist (disconnected, reconnecting, etc.)
- May need to add `poor_network_quality` event
- May need to add `peer_connection_failed` event

---

### Priority 4: UI Polish
**Time Estimate:** 3-4 hours
**Complexity:** Low
**Value:** Medium - professional appearance

**Improvements:**
1. **Loading States**
   - Spinner when starting camera
   - "Connecting..." indicator for peers
   - "Screen sharing starting..." feedback

2. **Animations**
   - Smooth transitions when videos appear/disappear
   - Fade in/out for participants joining/leaving
   - Slide animations for layout changes

3. **Confirmation Dialogs**
   - "Really leave room?" before exit
   - "Stop screen sharing?" confirmation
   - "End lecture?" for teachers

4. **Responsive Design**
   - Test on mobile/tablet
   - Adjust video grid for small screens
   - Stack controls vertically on mobile

5. **Accessibility**
   - Keyboard navigation
   - Screen reader support
   - High contrast mode

**Package Support:** Frontend only, no package changes needed

---

## 🚀 Phase 3A: Participant Management (Teaching-Specific)

### Priority 5: Participant Controls
**Time Estimate:** 6-8 hours
**Complexity:** Medium-High
**Value:** Very High - core teaching feature

**Features:**

#### 1. Mute All (Teacher Only)
```typescript
// Package API:
connection.muteAllParticipants()

// Event:
connection.on('muted_by_host', () => {
  // Disable mic, show notification
})
```

#### 2. Mute Individual (Teacher Only)
```typescript
// Package API:
connection.muteParticipant(userId)

// Event:
connection.on('muted_by_host', ({ reason }) => {
  // Disable mic
})
```

#### 3. Kick Participant (Teacher/Admin Only)
```typescript
// Package API:
connection.kickParticipant(userId, reason?)

// Event:
connection.on('kicked_from_room', ({ reason }) => {
  // Redirect to home, show reason
})
```

#### 4. Hand Raise (Students)
```typescript
// Package API:
connection.raiseHand()
connection.lowerHand()

// Events:
connection.on('hand_raised', ({ userId }) => {
  // Show indicator next to student
})

connection.on('hand_lowered', ({ userId }) => {
  // Remove indicator
})
```

**Package Implementation Required:**
- New events: `mute_participant`, `kick_participant`, `raise_hand`
- Permission checks (only teachers can mute/kick)
- Server-side validation
- Broadcast to all participants

**Frontend Tasks:**
- Teacher controls UI
- Student hand raise button
- Visual indicators for raised hands
- Queue system for raised hands

---

## 🚀 Phase 3B: Recording (High-Value Feature)

### Priority 6: Lecture Recording
**Time Estimate:** 2-3 days
**Complexity:** High
**Value:** Very High - teachers need this

**Package API Design:**
```typescript
// Start recording
connection.startRecording(options?: {
  includeAudio: boolean;
  includeVideo: boolean;
  quality: 'low' | 'medium' | 'high';
})

// Stop recording
connection.stopRecording(): Promise<RecordingInfo>

// Events
connection.on('recording_started', ({ recordingId }) => {
  // Show red dot indicator
})

connection.on('recording_stopped', ({ recordingId, duration, url }) => {
  // Offer download
})

connection.on('recording_available', ({ recordingId, url }) => {
  // Recording processed and ready
})
```

**Implementation Approaches:**

**Option A: Client-Side Recording (Simpler)**
- Use MediaRecorder API in browser
- Record teacher's screen/camera only
- Save to local file or upload to cloud
- Pros: Simple, no server processing
- Cons: Only records teacher view, not student interactions

**Option B: Server-Side Recording (Professional)**
- Server joins as "recorder" participant
- Captures all streams and composes them
- Generates MP4 with multiple tracks
- Pros: Professional quality, all participants
- Cons: Complex, server resources required

**Recommendation:** Start with Option A (client-side), upgrade to Option B later

**Frontend Tasks:**
1. Recording controls (start/stop button)
2. Recording indicator (red dot)
3. Recording timer
4. Download/access interface
5. Recording list (past recordings)

**Server Tasks:**
1. Track recording state per room
2. Generate unique recording IDs
3. Optional: Cloud storage integration (S3, GCS)
4. Optional: Processing queue for transcoding

---

## 🚀 Phase 3C: Breakout Rooms (Advanced Teaching)

### Priority 7: Breakout Rooms
**Time Estimate:** 3-5 days
**Complexity:** Very High
**Value:** High - enables group work

**Package API Design:**
```typescript
// Create breakout rooms
connection.createBreakoutRooms(config: {
  count: number;  // Number of rooms
  duration?: number;  // Auto-close after X minutes
  assignmentType: 'manual' | 'automatic' | 'student-choice';
})

// Assign participants
connection.assignToBreakoutRoom(roomId, userIds)

// Broadcast message to all breakout rooms
connection.broadcastToBreakoutRooms(message)

// Close all breakout rooms
connection.closeAllBreakoutRooms()

// Events
connection.on('assigned_to_breakout', ({ roomId, participants }) => {
  // Move to breakout room
})

connection.on('breakout_rooms_closing', ({ timeRemaining }) => {
  // Show countdown
})

connection.on('returned_from_breakout', () => {
  // Return to main room
})
```

**Features:**
1. Create N breakout rooms
2. Manual or automatic participant assignment
3. Teacher can visit breakout rooms
4. Broadcast messages to all breakouts
5. Timer for automatic return
6. Help requests from breakout rooms

**Implementation Complexity:**
- Each breakout room is essentially a new room instance
- Need to maintain reference to main room
- Synchronize return to main room
- Teacher monitoring/assistance

**Frontend Tasks:**
1. Breakout room creation UI
2. Participant assignment interface
3. Breakout room list/monitor (teacher view)
4. Timer display
5. Help request button (students)
6. "Return to main room" button

---

## 🎨 Phase 4: Polish Features

### Priority 8: Virtual Backgrounds
**Time Estimate:** 2-3 days
**Complexity:** High
**Value:** Medium - nice-to-have

**Package API:**
```typescript
connection.setVirtualBackground(imageUrl)
connection.enableBackgroundBlur(strength: number)
connection.disableBackgroundEffects()
```

**Implementation:**
- Use TensorFlow.js BodyPix model
- Segment person from background
- Apply blur or replace background
- Performance consideration: runs in browser

**Frontend Tasks:**
1. Background picker UI
2. Upload custom backgrounds
3. Blur strength slider
4. Preview before applying

---

## 📅 Recommended Implementation Schedule

### Week 1: Stabilization & Polish
```
Day 1-2: Multi-user testing & bug fixes
Day 3-4: Connection quality indicators
Day 5: Better error handling
Weekend: UI polish & responsive design
```

### Week 2: Core Teaching Features
```
Day 1-3: Participant controls (mute, kick, hand raise)
Day 4-5: Testing & refinement
Weekend: Documentation
```

### Week 3: Recording (v1.4.0)
```
Day 1-2: Client-side recording implementation
Day 3: Recording UI & controls
Day 4-5: Testing & cloud upload integration
Weekend: Documentation
```

### Week 4: Advanced Features (v1.5.0)
```
Option A: Breakout Rooms (if high priority)
Option B: Virtual Backgrounds (if requested)
Option C: Polish & optimize existing features
```

---

## 🎯 My Strong Recommendation

### Immediate Next Steps (This Week):

**1. Multi-User Testing (Today - 3 hours)**
- Open 3 browser tabs/devices
- Test all features with real network latency
- Document any bugs/issues

**2. Connection Quality (Tomorrow - 4 hours)**
```typescript
// Simple implementation:
setInterval(async () => {
  const stats = await peerConnection.getStats();
  const quality = calculateQuality(stats);
  updateVideoTileIndicator(peerId, quality);
}, 3000);
```

**3. Error Handling (Day 3 - 4 hours)**
- Add try-catch blocks
- Friendly error messages
- Toast notifications
- Auto-recovery attempts

**4. Participant Controls (Day 4-5 - 8 hours)**
- Mute all button (teacher)
- Hand raise (students)
- Basic kick function

### Why This Order?

1. **Testing First**: Validates current implementation works
2. **Quality Indicators**: Improves UX with minimal effort
3. **Error Handling**: Makes app feel professional
4. **Participant Controls**: Core teaching feature, high ROI

### What NOT to Do Yet:

- ❌ **Recording** - Complex, can wait until core features are solid
- ❌ **Breakout Rooms** - Very complex, need stable foundation first
- ❌ **Virtual Backgrounds** - Nice-to-have, not essential
- ❌ **SFU Architecture** - Only needed for 10+ participants

---

## 📊 Feature Priority Matrix

| Feature | Complexity | Value | Time | Priority |
|---------|-----------|-------|------|----------|
| Multi-user testing | Low | Critical | 3h | **P0** |
| Connection quality | Medium | High | 4h | **P0** |
| Error handling | Medium | High | 4h | **P0** |
| UI Polish | Low | Medium | 4h | **P1** |
| Participant controls | Med-High | Very High | 8h | **P1** |
| Recording | High | Very High | 3d | **P2** |
| Breakout rooms | Very High | High | 5d | **P3** |
| Virtual backgrounds | High | Medium | 3d | **P4** |

**Legend:**
- P0 = Do this week
- P1 = Do next week
- P2 = Do in 2-3 weeks
- P3 = Do in 1 month
- P4 = Nice-to-have

---

## 🔧 Technical Debt & Optimizations

### Current Known Issues:
1. **P2P Mesh Limitation**: Works well for 2-6 participants, degrades beyond that
   - **Solution**: Implement SFU in v2.0 (when needed)

2. **No Bandwidth Adaptation**: Video quality doesn't adjust to network
   - **Solution**: Implement adaptive bitrate in v1.4.0

3. **No Recovery from Connection Drops**: Peer connections don't auto-recover
   - **Solution**: Add automatic peer reconnection in v1.3.1

### Performance Optimizations:
1. Lazy load video components
2. Debounce stat calculations
3. Use Web Workers for video processing (backgrounds)
4. Optimize React re-renders

---

## 🎓 Learning & Research Needed

Before implementing:

**Recording:**
- Research MediaRecorder API browser support
- Investigate cloud storage options (S3, GCS)
- Study video processing pipelines

**Breakout Rooms:**
- Study Zoom's breakout room UX
- Plan data structure for room hierarchy
- Design participant reassignment logic

**Virtual Backgrounds:**
- Test BodyPix performance on target devices
- Evaluate alternative models (MediaPipe)
- Benchmark frame rate impact

---

## 📝 Next Steps

### Decision Points:

1. **Agree on Priority Order**
   - Confirm: Testing → Quality → Errors → Controls?
   - Or different order?

2. **Set Target Date for Recording**
   - When do teachers need this?
   - Can we ship v1.3.0 without it?

3. **Breakout Rooms: Essential or Nice-to-Have?**
   - If essential: prioritize over recording
   - If nice-to-have: defer to v1.5.0+

4. **Define "Done" Criteria**
   - How many participants do we test with?
   - What's acceptable connection quality?
   - Mobile support required?

### My Proposal:

**v1.3.0 (Next 2 weeks):**
- ✅ Multi-user testing complete
- ✅ Connection quality indicators
- ✅ Better error handling
- ✅ Participant controls (mute, kick, hand raise)
- ✅ UI polish

**v1.4.0 (Month 2):**
- ✅ Recording (client-side)
- ✅ Recording management UI
- ✅ Cloud storage integration

**v1.5.0 (Month 3):**
- ✅ Breakout rooms
- ✅ Advanced participant management

**v2.0.0 (Future):**
- ✅ SFU for 10+ participants
- ✅ Virtual backgrounds
- ✅ AI features

---

## ❓ Questions for Discussion

1. What's the typical class size you're targeting?
2. Are breakout rooms a must-have or nice-to-have?
3. When do teachers need recording functionality?
4. Should we support mobile devices in v1.3.0?
5. What's your definition of "production ready"?

**Let's discuss and finalize the plan before starting implementation!**
