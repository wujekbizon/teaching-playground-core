# Quick Start - Testing & Publishing

Fast reference guide for testing and publishing the Teaching Playground Core package.

## Testing Before Publishing

### Quick Test (Recommended)

The fastest way to test your package before publishing:

```bash
# Run comprehensive package test
pnpm run test:package

# Test in a fresh project
pnpm run test:integration
```

That's it! If both commands succeed, your package is ready to publish.

### Step-by-Step Testing

```bash
# 1. Run unit tests
pnpm test

# 2. Build the package
pnpm run build

# 3. Create package tarball
npm pack

# 4. Inspect what will be published
pnpm run pack:inspect
```

## Testing Locally in Another Project

### Method 1: Using npm pack (Recommended)

```bash
# In teaching-playground-core directory
npm pack
# Creates: teaching-playground-core-1.0.2.tgz

# In your test project
cd /path/to/your/test-project
npm install /home/user/teaching-playground-core/teaching-playground-core-1.0.2.tgz
```

**Test it:**
```typescript
// test.ts
import { TeachingPlayground } from '@teaching-playground/core';

const playground = new TeachingPlayground(8080);
playground.initialize();
```

### Method 2: Using npm link (For development)

```bash
# In teaching-playground-core directory
npm link

# In your test project
cd /path/to/your/test-project
npm link @teaching-playground/core
```

**Benefits:** Changes in source are immediately available after rebuild.

### Method 3: Using the automated script

```bash
# This creates a test project and runs all tests automatically
pnpm run test:integration
```

## Publishing to npm

### First Time

```bash
# Login to npm
npm login

# Publish
npm publish
```

### After Making Changes

```bash
# 1. Make your changes
# ... edit code ...

# 2. Test everything
pnpm run test:package

# 3. Bump version
npm version patch  # or minor, or major

# 4. Push to git
git push && git push --tags

# 5. Publish
npm publish
```

## Quick Commands Reference

```bash
# Testing
pnpm test                    # Run unit tests
pnpm run test:package        # Complete package test
pnpm run test:integration    # Test in fresh project
pnpm run pack:inspect        # Preview package contents

# Building
pnpm run build              # Build TypeScript
pnpm run dev                # Build in watch mode

# Packaging
npm pack                    # Create tarball
npm pack --dry-run          # Preview without creating file

# Publishing
npm publish                 # Publish to npm
npm publish --dry-run       # Preview without publishing

# Version management
npm version patch           # 1.0.2 → 1.0.3
npm version minor           # 1.0.2 → 1.1.0
npm version major           # 1.0.2 → 2.0.0
```

## Common Testing Scenarios

### Test imports work correctly

```typescript
import {
  TeachingPlayground,
  RoomConnection,
  RoomManagementSystem,
  EventManagementSystem,
  RealTimeCommunicationSystem
} from '@teaching-playground/core';

console.log('All imports successful!');
```

### Test TypeScript types

```typescript
import { TeachingPlayground, Room } from '@teaching-playground/core';

const playground = new TeachingPlayground(8080);

// TypeScript should provide autocomplete and type checking
const room: Room = {
  id: 'room-1',
  name: 'Test Room',
  description: 'Testing',
  teacherId: 'teacher-1',
  capacity: 50,
  participants: [],
  currentLecture: null,
  status: 'active',
  createdAt: new Date()
};
```

### Test server initialization

```typescript
import { TeachingPlayground } from '@teaching-playground/core';

async function test() {
  const playground = new TeachingPlayground(8080);
  await playground.initialize();

  const room = await playground.createRoom({
    name: 'Test',
    description: 'Testing',
    capacity: 50,
    teacherId: 'teacher-1'
  });

  console.log('Room created:', room.id);

  playground.shutdown();
}

test();
```

## Troubleshooting

### "Cannot find module @teaching-playground/core"

**In test project:**
```bash
# Check if installed
ls node_modules/@teaching-playground/

# Reinstall
npm install /path/to/teaching-playground-core-1.0.2.tgz
```

### TypeScript types not working

```bash
# Ensure types are built
ls dist/index.d.ts

# If missing, rebuild
pnpm run build
```

### Package too large

```bash
# Check what's included
npm pack --dry-run

# Verify .npmignore is working
cat .npmignore
```

## Full Documentation

For detailed guides, see:
- [TESTING.md](./TESTING.md) - Comprehensive testing guide
- [PUBLISHING.md](./PUBLISHING.md) - Publishing and version management
- [README.md](./README.md) - Package documentation

## Pre-Publish Checklist

Before running `npm publish`:

- [ ] All tests pass: `pnpm test`
- [ ] Package tests pass: `pnpm run test:package`
- [ ] Integration tests pass: `pnpm run test:integration`
- [ ] Version bumped: `npm version patch/minor/major`
- [ ] Git committed and pushed
- [ ] CHANGELOG updated (if applicable)

## Quick Publish Workflow

```bash
# Complete workflow from change to publish

# 1. Make changes
# ... edit code ...

# 2. Test
pnpm run test:package

# 3. Test integration
pnpm run test:integration

# 4. Version
npm version patch

# 5. Git
git push && git push --tags

# 6. Publish
npm publish

# 7. Verify
npm view @teaching-playground/core
```

Done! Your package is now published and ready to use.
