# Teaching Playground Core

![Version](https://img.shields.io/badge/version-1.0.2-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8.2-blue)
![License](https://img.shields.io/badge/license-Private-red.svg)

> A WebSocket and WebRTC-based real-time teaching and learning management system for virtual classrooms

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [API Reference](#api-reference)
- [WebSocket Events](#websocket-events)
- [Project Structure](#project-structure)
- [Development](#development)
- [Testing](#testing)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

**Teaching Playground Core** is a comprehensive TypeScript-based system for building virtual online teaching platforms. It provides the foundational infrastructure for:

- **Real-time communication** between teachers and students
- **WebRTC video/audio streaming** for live lectures
- **Virtual classroom management** with rooms and participants
- **Event scheduling and management** for lectures
- **Chat messaging** within classrooms
- **Screen sharing** capabilities (infrastructure ready)

This package serves as the core engine for the **Wolfmed educational application**, enabling interactive online learning experiences where students can watch live or recorded lessons, communicate with teachers, and collaborate with peers.

### Key Capabilities

- **Live Streaming:** Teachers can broadcast video/audio to multiple students simultaneously
- **Two-Way Communication:** Real-time chat and messaging within classrooms
- **Room Management:** Create and manage virtual classrooms with capacity limits and features
- **Lecture Scheduling:** Schedule, start, complete, or cancel lectures
- **Persistent Storage:** JSON-based database for development and testing
- **Scalable Architecture:** Four independent systems that work together seamlessly

---

## Features

### Real-Time Communication

- **WebSocket Layer** (Socket.io)
  - Low-latency bidirectional messaging
  - Automatic reconnection with exponential backoff
  - Room-based message broadcasting
  - Connection state management

- **WebRTC Layer** (Native RTCPeerConnection)
  - Peer-to-peer video/audio streaming
  - STUN server configuration (Google STUN servers)
  - ICE candidate negotiation
  - Track management with transceivers
  - Configurable stream quality (low/medium/high)

### Room Management

- Create virtual classrooms with customizable features
- Set capacity limits and participant permissions
- Role-based access control (teacher, student, admin)
- Real-time participant tracking
- Room status management (available, occupied, scheduled, maintenance)
- Features toggle: video, audio, chat, whiteboard, screen sharing

### Event Management

- Full CRUD operations for lectures
- Status tracking (scheduled, in-progress, completed, cancelled, delayed)
- Validation with Zod schemas
- Teacher authorization checks
- Room-lecture associations
- Lecture duration tracking

### Data Persistence

- JSON-based file storage (development)
- Singleton pattern for consistent state
- Browser and server dual-mode support
- Automatic data loading and saving
- Query operations (find, findOne, insert, update, delete)

---

## Architecture

The system is built with four independent, loosely-coupled subsystems:

```
┌─────────────────────────────────────────────────────────────┐
│                   TeachingPlayground Engine                  │
│                     (Orchestration Layer)                    │
└──────────────┬────────────────┬────────────┬────────────────┘
               │                │            │
      ┌────────▼───────┐  ┌────▼─────┐  ┌──▼──────────┐
      │  Room System   │  │  Event   │  │    Comms    │
      │                │  │  System  │  │   System    │
      │ - Create rooms │  │          │  │             │
      │ - Manage       │  │ - CRUD   │  │ - WebSocket │
      │   participants │  │   lectures│  │ - WebRTC    │
      │ - Track state  │  │ - Schedule│  │ - Streaming │
      └────────────────┘  └──────────┘  └─────────────┘
               │                │              │
               └────────────────┼──────────────┘
                                │
                       ┌────────▼────────┐
                       │  Data System    │
                       │                 │
                       │ - JsonDatabase  │
                       │ - Persistence   │
                       │ - State mgmt    │
                       └─────────────────┘
```

### System Components

#### 1. Room Management System
**Location:** `src/systems/room/RoomManagementSystem.ts`

Manages virtual classrooms and participants:
- Room creation with unique IDs
- Capacity management
- Participant add/remove operations
- Permission assignment based on roles
- Current lecture tracking
- Stream status management

#### 2. Real-Time Communication System
**Location:** `src/systems/comms/RealTimeCommunicationSystem.ts`

Handles all real-time communication:
- Socket.io server setup and configuration
- WebSocket event handling (join, leave, message, stream)
- Room-based message broadcasting
- Resource allocation/deallocation per lecture
- Stream state tracking
- Connection health monitoring

#### 3. Event Management System
**Location:** `src/systems/event/EventManagementSystem.ts`

Manages lectures and scheduling:
- Lecture CRUD operations
- Zod schema validation
- Status lifecycle management
- Teacher authorization
- Room updates when lectures change
- Lecture filtering and queries

#### 4. Data Management System
**Location:** `src/systems/data/DataManagementSystem.ts`

Provides data persistence interface:
- JsonDatabase integration
- Backup and restore (planned)
- Data statistics (planned)
- Error handling

---

## Installation

### Prerequisites

- **Node.js:** v16 or higher
- **pnpm:** v8 or higher (recommended package manager)
- **TypeScript:** v5.0 or higher

### Install Dependencies

```bash
# Clone the repository
git clone https://github.com/your-org/teaching-playground-core.git
cd teaching-playground-core

# Install dependencies
pnpm install

# Build the project
pnpm build
```

### Environment Setup

Create a `.env` file in the root directory (optional, defaults provided):

```env
# Server Configuration
PORT=3001
NODE_ENV=development

# WebSocket Configuration
NEXT_PUBLIC_WS_URL=http://localhost:3000

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

---

## Quick Start

### Server Setup

Create a WebSocket server:

```typescript
// server.ts
import { createServer } from 'http'
import { startWebSocketServer } from '@teaching-playground/core'

const httpServer = createServer()
const PORT = process.env.PORT || 3001

startWebSocketServer(httpServer, {
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',') || ['*']
})

httpServer.listen(PORT, () => {
  console.log(`WebSocket server running on port ${PORT}`)
})
```

```bash
# Run the server
pnpm server
# or with watch mode
pnpm server:dev
```

### Client Setup

Connect to a classroom:

```typescript
import { RoomConnection } from '@teaching-playground/core'

// Initialize connection
const connection = new RoomConnection(
  'ws://localhost:3001',
  'room-123',
  { id: 'user-1', username: 'John Doe', role: 'student' }
)

// Connect to the room
await connection.connect()

// Listen for messages
connection.on('message', (message) => {
  console.log(`${message.username}: ${message.content}`)
})

// Listen for streams
connection.on('stream_added', ({ peerId, stream }) => {
  const videoElement = document.getElementById('video')
  videoElement.srcObject = stream
})

// Send a message
connection.sendMessage('Hello, class!')
```

### Teacher Streaming

Start broadcasting video/audio:

```typescript
import { RoomConnection } from '@teaching-playground/core'

const connection = new RoomConnection(
  'ws://localhost:3001',
  'room-123',
  { id: 'teacher-1', username: 'Prof. Smith', role: 'teacher' }
)

await connection.connect()

// Get user media
const stream = await navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
})

// Start streaming
await connection.startStream(stream, 'high')

// Stop streaming
await connection.stopStream()
```

---

## Usage

### Full Application Example

```typescript
import TeachingPlayground from '@teaching-playground/core'

// Initialize the playground
const playground = new TeachingPlayground({
  roomConfig: {
    maxCapacity: 100,
    defaultFeatures: {
      hasVideo: true,
      hasAudio: true,
      hasChat: true,
      hasWhiteboard: false,
      hasScreenShare: true
    }
  },
  commsConfig: {
    allowedOrigins: ['http://localhost:3000'],
    pingTimeout: 10000
  },
  eventConfig: {},
  dataConfig: {
    dbPath: 'data/teaching.json'
  }
})

// Set current user (teacher)
playground.setCurrentUser({
  id: 'teacher-1',
  username: 'Prof. Smith',
  email: 'smith@university.edu',
  role: 'teacher',
  profile: {
    firstName: 'John',
    lastName: 'Smith',
    department: 'Computer Science'
  }
})

// Create a classroom
const room = await playground.createClassroom({
  name: 'Introduction to TypeScript',
  capacity: 30,
  features: {
    hasVideo: true,
    hasAudio: true,
    hasChat: true,
    hasWhiteboard: true,
    hasScreenShare: true
  }
})

// Schedule a lecture
const lecture = await playground.scheduleLecture({
  name: 'TypeScript Basics',
  date: '2025-01-15T14:00:00Z',
  roomId: room.id,
  description: 'Learn the fundamentals of TypeScript',
  maxParticipants: 30
})

console.log('Lecture scheduled:', lecture.id)

// Get all lectures for this teacher
const lectures = await playground.getTeacherLectures({
  status: 'scheduled'
})

// Update lecture
await playground.updateLecture(lecture.id, {
  description: 'Updated description with more details'
})

// Cancel lecture
await playground.cancelLecture(lecture.id, 'Unexpected schedule conflict')
```

---

## API Reference

### TeachingPlayground Class

Main orchestration class that coordinates all systems.

#### Constructor

```typescript
constructor(config: TeachingPlaygroundConfig)
```

**Parameters:**
- `config.roomConfig`: Room management configuration
- `config.commsConfig`: Communication system configuration
- `config.eventConfig`: Event management configuration
- `config.dataConfig`: Data persistence configuration

#### User Management

##### `setCurrentUser(user: User): void`

Set the currently authenticated user (required for authorization).

**Parameters:**
- `user`: User object with id, username, email, role, and profile

#### Room Management

##### `createClassroom(options): Promise<Room>`

Create a new virtual classroom.

**Parameters:**
- `options.name` (string): Classroom name
- `options.capacity` (number): Maximum participants
- `options.features` (Partial<RoomFeatures>): Optional feature configuration

**Returns:** Promise resolving to created Room

**Example:**
```typescript
const room = await playground.createClassroom({
  name: 'Math 101',
  capacity: 50,
  features: { hasWhiteboard: true }
})
```

#### Event Management

##### `scheduleLecture(options): Promise<Lecture>`

Schedule a new lecture (requires teacher role).

**Parameters:**
- `options.name` (string): Lecture name (3-100 chars)
- `options.date` (string): ISO 8601 date string
- `options.roomId` (string): Associated room ID
- `options.description` (string, optional): Lecture description (10-500 chars)
- `options.maxParticipants` (number, optional): Max participants (1-100)

**Returns:** Promise resolving to created Lecture

**Throws:**
- `SystemError('UNAUTHORIZED')`: If user is not a teacher
- `SystemError('VALIDATION_ERROR')`: If input validation fails
- `SystemError('LECTURE_SCHEDULING_FAILED')`: If scheduling fails

##### `getTeacherLectures(options?): Promise<Lecture[]>`

Get all lectures for the current teacher.

**Parameters:**
- `options.status` (optional): Filter by lecture status
- `options.fromDate` (optional): Filter lectures from this date
- `options.toDate` (optional): Filter lectures until this date

**Returns:** Promise resolving to array of Lectures

##### `updateLecture(lectureId, updates): Promise<Lecture>`

Update an existing lecture (requires ownership).

**Parameters:**
- `lectureId` (string): Lecture ID
- `updates`: Partial lecture object with fields to update

**Returns:** Promise resolving to updated Lecture

##### `cancelLecture(lectureId, reason?): Promise<void>`

Cancel a lecture (requires ownership).

**Parameters:**
- `lectureId` (string): Lecture ID
- `reason` (string, optional): Cancellation reason

##### `listLectures(roomId?): Promise<Lecture[]>`

List all lectures, optionally filtered by room.

**Parameters:**
- `roomId` (string, optional): Filter by room ID

**Returns:** Promise resolving to array of Lectures with communication status

##### `getLectureDetails(lectureId): Promise<Lecture>`

Get detailed information about a specific lecture.

**Parameters:**
- `lectureId` (string): Lecture ID

**Returns:** Promise resolving to Lecture with participants and communication status

---

## WebSocket Events

### Client → Server Events

#### `join_room`
Join a virtual classroom.

**Payload:**
```typescript
{
  roomId: string,
  userId: string
}
```

**Server Response:** `room_state` event with current room data

#### `leave_room`
Leave a classroom.

**Payload:**
```typescript
{
  roomId: string
}
```

#### `send_message`
Send a chat message to the room.

**Payload:**
```typescript
{
  roomId: string,
  message: {
    userId: string,
    username: string,
    content: string
  }
}
```

**Broadcast:** `new_message` event to all room participants

#### `start_stream`
Start broadcasting video/audio stream.

**Payload:**
```typescript
{
  roomId: string,
  userId: string,
  quality: 'low' | 'medium' | 'high'
}
```

**Broadcast:** `stream_started` event to all room participants

#### `stop_stream`
Stop broadcasting stream.

**Payload:**
```typescript
{
  roomId: string
}
```

**Broadcast:** `stream_stopped` event to all room participants

### Server → Client Events

#### `room_state`
Sent when client joins a room, contains current room state.

**Payload:**
```typescript
{
  stream: {
    isActive: boolean,
    streamerId: string | null,
    quality: 'low' | 'medium' | 'high'
  },
  participants: string[], // Array of socket IDs
  messages: Array<{
    userId: string,
    username: string,
    content: string,
    timestamp: string // ISO 8601
  }>
}
```

#### `user_joined`
Broadcast when a user joins the room.

**Payload:**
```typescript
{
  userId: string,
  socketId: string
}
```

#### `user_left`
Broadcast when a user leaves the room.

**Payload:**
```typescript
{
  socketId: string
}
```

#### `new_message`
Broadcast when a new message is sent.

**Payload:**
```typescript
{
  userId: string,
  username: string,
  content: string,
  timestamp: string // ISO 8601
}
```

#### `stream_started`
Broadcast when a stream starts.

**Payload:**
```typescript
{
  isActive: true,
  streamerId: string,
  quality: 'low' | 'medium' | 'high'
}
```

#### `stream_stopped`
Broadcast when a stream stops.

**No payload**

#### `error`
Sent when an error occurs.

**Payload:**
```typescript
{
  message: string
}
```

---

## Project Structure

```
teaching-playground-core/
├── src/
│   ├── engine/
│   │   └── TeachingPlayground.ts      # Main orchestration class
│   ├── systems/
│   │   ├── room/
│   │   │   └── RoomManagementSystem.ts
│   │   ├── event/
│   │   │   └── EventManagementSystem.ts
│   │   ├── comms/
│   │   │   └── RealTimeCommunicationSystem.ts
│   │   └── data/
│   │       └── DataManagementSystem.ts
│   ├── services/
│   │   ├── RoomConnection.ts          # Client WebSocket manager
│   │   └── WebRTCService.ts           # WebRTC peer connection handler
│   ├── interfaces/
│   │   ├── room.interface.ts
│   │   ├── event.interface.ts
│   │   ├── comms.interface.ts
│   │   ├── user.interface.ts
│   │   ├── data.interface.ts
│   │   ├── errors.interface.ts
│   │   ├── teaching-playground.interface.ts
│   │   ├── schema.ts                  # Zod validation schemas
│   │   └── index.ts
│   ├── utils/
│   │   └── JsonDatabase.ts            # File-based database
│   ├── server.ts                      # WebSocket server entry point
│   └── index.ts                       # Public API exports
├── dist/                              # Compiled JavaScript output
├── data/                              # JSON database files (auto-created)
├── tests/                             # Test files (to be created)
├── BUGS_AND_ISSUES.md                 # Known issues documentation
├── ROADMAP.md                         # Development roadmap
├── README.md                          # This file
├── package.json
├── tsconfig.json
└── pnpm-lock.yaml
```

---

## Development

### Available Scripts

```bash
# Development with watch mode
pnpm dev

# Build TypeScript
pnpm build

# Run tests (requires Jest configuration)
pnpm test

# Lint code
pnpm lint

# Start WebSocket server
pnpm server

# Start server with watch mode
pnpm server:dev
```

### Development Workflow

1. **Make changes** to TypeScript files in `src/`
2. **Run watch mode:** `pnpm dev` to auto-compile
3. **Test changes:** `pnpm server:dev` to run server with hot reload
4. **Write tests:** Add `.test.ts` files in `tests/` directory
5. **Run tests:** `pnpm test`
6. **Lint code:** `pnpm lint` before committing
7. **Build:** `pnpm build` to create production build

### Adding New Features

1. Define interfaces in `src/interfaces/`
2. Implement system logic in appropriate `src/systems/` directory
3. Export public API in `src/index.ts`
4. Write tests in `tests/` directory
5. Update this README with new documentation

---

## Testing

### Current Status

⚠️ **No tests are currently implemented.** This is a critical gap that needs to be addressed.

See [ROADMAP.md](./ROADMAP.md) for the testing implementation plan.

### Planned Testing Strategy

#### Unit Tests
- Room management operations
- Event CRUD operations
- Database queries
- Validation schemas
- Error handling

#### Integration Tests
- WebSocket event flows
- Room-lecture associations
- Authorization checks
- Multi-system interactions

#### E2E Tests
- Full lecture lifecycle
- Client connections
- Stream broadcasting
- Chat messaging

### Running Tests (Once Implemented)

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm test RoomManagementSystem.test.ts

# Watch mode
pnpm test:watch
```

---

## Deployment

### Production Build

```bash
# Install dependencies
pnpm install --prod

# Build TypeScript
pnpm build

# Set environment variables
export NODE_ENV=production
export PORT=3001
export ALLOWED_ORIGINS=https://your-domain.com

# Start server
node dist/server.js
```

### Docker Deployment (Example)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --prod
COPY dist ./dist
EXPOSE 3001
CMD ["node", "dist/server.js"]
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | WebSocket server port |
| `NODE_ENV` | development | Environment mode |
| `ALLOWED_ORIGINS` | * | CORS allowed origins (comma-separated) |
| `NEXT_PUBLIC_WS_URL` | http://localhost:3000 | WebSocket URL for clients |

### Reverse Proxy Configuration (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /socket.io/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## Troubleshooting

### WebSocket Connection Fails

**Symptom:** Client cannot connect to server

**Possible Causes:**
- Server not running: `pnpm server`
- CORS misconfiguration: Check `ALLOWED_ORIGINS`
- Firewall blocking port: Open port 3001
- Wrong URL: Verify `ws://localhost:3001`

### WebRTC Stream Not Working

**Symptom:** Video/audio stream not received by students

**Possible Causes:**
- Signaling not integrated (known bug - see BUGS_AND_ISSUES.md #1)
- ICE candidates not exchanged
- STUN server unreachable
- Browser permissions denied

**Current Status:** WebRTC signaling layer is not fully integrated. See roadmap for fix.

### Database Errors

**Symptom:** `DATABASE_WRITE_ERROR` or data not persisting

**Possible Causes:**
- `data/` directory doesn't exist: Auto-created on first run
- File permissions: Check write permissions in project directory
- Race condition: Known issue (see BUGS_AND_ISSUES.md #2)

### Authorization Errors

**Symptom:** `UNAUTHORIZED` error when scheduling lectures

**Cause:** Current user not set or user not a teacher

**Fix:**
```typescript
playground.setCurrentUser({
  id: 'teacher-1',
  username: 'teacher',
  role: 'teacher', // Must be 'teacher' or 'admin'
  email: 'teacher@example.com'
})
```

---

## Contributing

### Development Guidelines

1. **Code Style:** Follow existing TypeScript conventions
2. **Types:** Always use TypeScript types, no `any` unless necessary
3. **Error Handling:** Use SystemError with appropriate error codes
4. **Logging:** Use console.log for now (will migrate to proper logger)
5. **Tests:** Write tests for all new features
6. **Documentation:** Update README and JSDoc comments

### Pull Request Process

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Write tests
5. Update documentation
6. Run linter: `pnpm lint`
7. Build: `pnpm build`
8. Submit PR with clear description

---

## Known Issues

See [BUGS_AND_ISSUES.md](./BUGS_AND_ISSUES.md) for comprehensive list of known bugs and issues.

### Critical Issues

1. **WebRTC Signaling Not Integrated:** WebRTC events not relayed via WebSocket (Issue #1)
2. **JsonDatabase Race Conditions:** Concurrent operations can cause data corruption (Issue #2)
3. **RoomConnection Not Integrated:** Client service not connected to server (Issue #3)
4. **DataManagementSystem Stubbed:** All methods just log to console (Issue #4)

See roadmap for planned fixes.

---

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for detailed development roadmap including:
- MVP bug fixes
- Testing infrastructure
- Production-ready improvements
- Future enhancements

---

## License

Private - All rights reserved

---

## Support

For questions or issues:
- Create an issue on GitHub
- Contact: your-email@example.com
- Documentation: See this README and other docs in the repository

---

## Acknowledgments

Built with:
- [Socket.io](https://socket.io/) - WebSocket library
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [Zod](https://zod.dev/) - Schema validation
- Native [WebRTC](https://webrtc.org/) - Real-time communication

---

**Version:** 1.0.2
**Last Updated:** 2025-01-15
**Status:** MVP Development (Pre-Alpha)
