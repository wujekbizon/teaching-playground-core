# @teaching-playground/core

Core functionality for the Teaching Playground system, providing real-time communication, room management, and event handling capabilities.

## Architecture

The core package consists of several key systems:

- Room Management System
- Real-time Communication System (WebSocket + WebRTC)
- Event Management System
- Data Management System

## Installation

```bash
# Install all dependencies
pnpm install

# Add new dependencies
pnpm add <package-name> --filter @teaching-playground/core

# Add dev dependencies
pnpm add -D <package-name> --filter @teaching-playground/core

# Update dependencies
pnpm update --filter @teaching-playground/core
```

## Package Installation Commands

```bash
# WebSocket Layer
pnpm add socket.io socket.io-client @types/socket.io @types/socket.io-client --filter @teaching-playground/core

# WebRTC Layer
pnpm add simple-peer @types/simple-peer --filter @teaching-playground/core

# Type Safety & Validation
pnpm add zod @trpc/server @trpc/client --filter @teaching-playground/core

# Core Utilities
pnpm add eventemitter3 @types/eventemitter3 --filter @teaching-playground/core
pnpm add -D @types/node uuid @types/uuid --filter @teaching-playground/core
```

## Dependencies

### WebSocket Layer

- `socket.io` - Server-side WebSocket implementation
- `socket.io-client` - Client-side WebSocket implementation
- Purpose: Handles real-time messaging, signaling, and updates

### WebRTC Layer

- `simple-peer` - WebRTC peer connection management
- Purpose: Manages video/audio streaming and screen sharing

### Type Safety & Validation

- `zod` - Runtime schema validation
- `@trpc/server` & `@trpc/client` - Type-safe API layer
- Purpose: Ensures type safety and data validation across the system

### Core Utilities

- `eventemitter3` - Event system
- `uuid` - Unique identifier generation
- Purpose: Internal system communication and resource identification

## Project Structure

packages/core/
├── src/
│ ├── systems/
│ │ ├── room/ # Room management
│ │ ├── event/ # Event handling
│ │ ├── comms/ # WebSocket/WebRTC
│ │ └── data/ # Data management
│ ├── interfaces/ # Type definitions
│ ├── utils/ # Shared utilities
│ └── index.ts # Public API
├── tests/
├── README.md
├── package.json
└── tsconfig.json

## Development

```bash
Watch mode
pnpm dev
Build
pnpm build
Run tests
pnpm test
```

## Usage

```typescript
import  TeachingPlayground  from '@teaching-playground/core';
// Initialize the playground
const playground = new TeachingPlayground({
// configuration
});
// Create a classroom
const classroom = await playground.createClassroom({
name: 'Math 101',
// other options
});
```

## System Dependencies

1. Room Management System

   - Manages virtual rooms and participants
   - Handles room lifecycle and permissions

2. Real-time Communication System

   - WebSocket for messaging and signaling
   - WebRTC for media streaming
   - Handles connection management

3. Event Management System

   - Schedules and manages events
   - Handles notifications and updates

4. Data Management System
   - Manages data persistence
   - Handles state synchronization

## Contributing

1. Create a feature branch
2. Make your changes
3. Run tests
4. Submit a pull request

## License

Private - All rights reserved

## Recent Updates

### Event System Implementation (Latest)
- ✅ Added complete CRUD operations for lectures
- ✅ Implemented form validation with Zod schemas
- ✅ Added error handling and form state persistence
- ✅ Integrated with JSON file-based storage
- ✅ Added date formatting utilities
- ✅ Implemented user authorization checks

### Data Layer
- ✅ Implemented JsonDatabase for temporary storage
- ✅ Added CRUD operations for events
- ✅ Added error handling for database operations
- ✅ Implemented data persistence in JSON files

### Form Handling
- ✅ Added form state management
- ✅ Implemented field error handling
- ✅ Added validation feedback
- ✅ Added form value persistence on errors
- ✅ Standardized date input/output format

### UI Components
- ✅ Added modal-based lecture creation
- ✅ Implemented lecture listing with status
- ✅ Added cancel/edit functionality
- ✅ Added consistent date formatting

### Next Steps
1. Implement room management UI
2. Add WebSocket connection handling
3. Implement real-time updates
4. Add user session management
5. Implement proper database integration

## File Structure Updates
```
packages/core/
├── src/
│   ├── systems/
│   │   ├── event/
│   │   │   └── EventManagementSystem.ts   # Lecture CRUD operations
│   │   └── ...
│   ├── utils/
│   │   └── JsonDatabase.ts                # Temporary storage solution
│   └── interfaces/
│       ├── event.interface.ts             # Event type definitions
│       └── ...
└── README.md
```

## Usage Example
```typescript
// Initialize playground
const playground = new TeachingPlayground(config)
playground.setCurrentUser(teacher)

// Create a lecture
const lecture = await playground.scheduleLecture({
  name: "Introduction to TypeScript",
  date: "2024-01-16T14:00",
  roomId: "room_1",
  description: "Learn the basics",
  maxParticipants: 30
})

// List lectures
const lectures = await playground.getTeacherLectures()
```

## System Architecture Updates

### Error Handling

- Added centralized error handling with SystemError class
- Implemented error codes for different failure scenarios
- Added error logging and propagation

### Event Management

- Added CRUD operations for lectures
- Implemented event filtering by room
- Added status tracking for lectures

### Communication System

- Added resource allocation/deallocation
- Implemented status checking for WebSocket/WebRTC
- Prepared for real-time communication implementation

### Room Management

- Added room creation with unique IDs
- Implemented participant tracking
- Prepared for real-time updates

### Data Management System

- Added CRUD operations for data
- Implemented backup and restore functionality
- Added data statistics tracking
- Implemented error handling for data operations

### Next Steps

1. Implement WebSocket connection management
2. Add WebRTC peer connection handling
3. Implement database integration
4. Add data validation and transformation
5. Implement backup scheduling

### Event System Updates

- ✅ Added Zod validation schemas for events
- ✅ Implemented input validation for event creation/updates
- ✅ Enhanced error handling with validation errors
- ✅ Added type safety for event operations

### Validation System

- Added schema validation using Zod
- Implemented validation error handling
- Added type inference for validated inputs
- Centralized validation schemas

### Error Handling Updates

- Added validation error codes
- Enhanced error details for validation failures
- Improved error propagation
