# Testing Guide for Teaching Playground Core

This guide provides comprehensive instructions for testing the Teaching Playground Core package locally before publishing to npm.

## Table of Contents

1. [Running Unit Tests](#1-running-unit-tests)
2. [Building the Package](#2-building-the-package)
3. [Testing Locally with npm pack](#3-testing-locally-with-npm-pack)
4. [Testing with npm link](#4-testing-with-npm-link)
5. [Integration Testing](#5-integration-testing)
6. [Pre-Publish Checklist](#6-pre-publish-checklist)

---

## 1. Running Unit Tests

Before anything else, run the existing test suite to ensure all functionality works correctly.

```bash
# Install dependencies if not already installed
pnpm install

# Run all tests
pnpm test

# Run tests in watch mode during development
pnpm test -- --watch

# Run tests with coverage
pnpm test -- --coverage
```

**What to check:**
- All tests should pass
- No unexpected errors or warnings
- Coverage should be reasonable (aim for >70%)

---

## 2. Building the Package

Ensure the TypeScript compilation works without errors.

```bash
# Clean previous build
rm -rf dist/

# Build the package
pnpm run build

# Verify build output
ls -la dist/
```

**What to check:**
- No TypeScript compilation errors
- `dist/` folder contains all expected files
- Both `.js` and `.d.ts` files are generated
- File structure mirrors the `src/` structure

**Verify specific files:**
```bash
# Check main entry point exists
ls -la dist/index.js dist/index.d.ts

# Check all systems are compiled
ls -la dist/systems/

# Check size of build output
du -sh dist/
```

---

## 3. Testing Locally with npm pack

This method creates a tarball (`.tgz` file) of your package, simulating exactly what will be published to npm.

### Step 1: Create the Package Tarball

```bash
# Navigate to your package directory
cd /home/user/teaching-playground-core

# Create a tarball (this will also run prepublishOnly script)
npm pack
```

This creates a file like `teaching-playground-core-1.0.2.tgz`.

### Step 2: Inspect Package Contents

```bash
# See what will be published (dry run)
npm pack --dry-run

# Extract and inspect the tarball contents
tar -tzf teaching-playground-core-1.0.2.tgz

# Or extract it to examine
mkdir -p /tmp/package-test
tar -xzf teaching-playground-core-1.0.2.tgz -C /tmp/package-test
cd /tmp/package-test/package
ls -la
```

**What to check:**
- Only necessary files are included (dist/, README.md, LICENSE, package.json)
- No source files (src/) are included
- No test files or development configs
- No node_modules/
- Package size is reasonable (should be ~30-40 KB compressed)

### Step 3: Test in a Separate Project

Create a test project to install and use your package:

```bash
# Create a test project directory
mkdir -p ~/test-teaching-playground
cd ~/test-teaching-playground

# Initialize a new project
npm init -y

# Install TypeScript and required dependencies
npm install typescript @types/node socket.io-client

# Install your local package tarball
npm install /home/user/teaching-playground-core/teaching-playground-core-1.0.2.tgz
```

### Step 4: Create Test Files

Create a test file to verify the package works:

**`~/test-teaching-playground/test-server.ts`**
```typescript
import { TeachingPlayground } from '@teaching-playground/core';

async function testServer() {
  console.log('Starting Teaching Playground server...');

  const playground = new TeachingPlayground(8080);

  await playground.initialize();

  console.log('Server initialized successfully!');
  console.log('Server is running on port 8080');

  // Test creating a room
  const room = await playground.createRoom({
    name: 'Test Room',
    description: 'Testing the package',
    capacity: 50,
    teacherId: 'test-teacher-123'
  });

  console.log('Room created:', room);

  // List all rooms
  const rooms = playground.getRooms();
  console.log('All rooms:', rooms);

  // Cleanup
  setTimeout(() => {
    playground.shutdown();
    console.log('Server shutdown complete');
    process.exit(0);
  }, 2000);
}

testServer().catch(console.error);
```

**`~/test-teaching-playground/test-client.ts`**
```typescript
import { RoomConnection } from '@teaching-playground/core';

async function testClient() {
  console.log('Testing RoomConnection...');

  const connection = new RoomConnection({
    serverUrl: 'http://localhost:8080',
    roomId: 'test-room-id',
    userId: 'test-user-123',
    userName: 'Test User'
  });

  // Listen for connection events
  connection.on('connected', () => {
    console.log('Client connected successfully!');
  });

  connection.on('error', (error) => {
    console.error('Connection error:', error);
  });

  connection.on('room-joined', (data) => {
    console.log('Joined room:', data);
  });

  // Connect to the room
  await connection.connect();

  console.log('Connection test complete');
}

testClient().catch(console.error);
```

**`~/test-teaching-playground/tsconfig.json`**
```json
{
  "compilerOptions": {
    "target": "es2020",
    "module": "esnext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist"
  },
  "include": ["*.ts"]
}
```

### Step 5: Run the Tests

```bash
cd ~/test-teaching-playground

# Compile TypeScript
npx tsc

# Run server test
node dist/test-server.js

# In a separate terminal, run client test (if server is running)
node dist/test-client.js
```

**What to check:**
- TypeScript compilation works without errors
- No import errors
- Type definitions are properly recognized
- All exported modules are accessible
- Server starts and runs correctly
- Client can import and use the package

---

## 4. Testing with npm link

An alternative to `npm pack` for faster iteration during development.

### Step 1: Link Your Package Globally

```bash
# Navigate to your package directory
cd /home/user/teaching-playground-core

# Create a global symlink
npm link
# or
pnpm link --global
```

### Step 2: Link in Test Project

```bash
# Navigate to your test project
cd ~/test-teaching-playground

# Link the package
npm link @teaching-playground/core
# or
pnpm link --global @teaching-playground/core
```

### Step 3: Test and Develop

Now you can make changes in your source package and test them immediately:

```bash
# In teaching-playground-core directory
cd /home/user/teaching-playground-core

# Make changes to source code
# ...

# Rebuild
pnpm run build

# Changes are immediately available in test project!
cd ~/test-teaching-playground
node dist/test-server.js
```

### Step 4: Unlink When Done

```bash
# In test project
cd ~/test-teaching-playground
npm unlink @teaching-playground/core

# In package directory
cd /home/user/teaching-playground-core
npm unlink
```

**Advantages of npm link:**
- Faster iteration (no need to pack/install each time)
- Real-time testing of changes

**Disadvantages:**
- Doesn't test the actual package structure
- May include files that won't be in the published package

---

## 5. Integration Testing

### Create a Full Integration Test

Create a more comprehensive test that simulates real-world usage:

**`~/test-teaching-playground/integration-test.ts`**
```typescript
import { TeachingPlayground, RoomConnection } from '@teaching-playground/core';

async function integrationTest() {
  console.log('=== Starting Integration Test ===\n');

  // 1. Initialize server
  console.log('1. Initializing server...');
  const playground = new TeachingPlayground(8081);
  await playground.initialize();
  console.log('✓ Server initialized\n');

  // 2. Create a room
  console.log('2. Creating a room...');
  const room = await playground.createRoom({
    name: 'Integration Test Room',
    description: 'Full integration test',
    capacity: 100,
    teacherId: 'teacher-001'
  });
  console.log('✓ Room created:', room.id, '\n');

  // 3. Verify room exists
  console.log('3. Verifying room...');
  const rooms = playground.getRooms();
  const foundRoom = rooms.find(r => r.id === room.id);
  if (!foundRoom) {
    throw new Error('Room not found!');
  }
  console.log('✓ Room verified\n');

  // 4. Test room management
  console.log('4. Testing room management...');
  const roomDetails = playground.getRoom(room.id);
  console.log('✓ Room details:', roomDetails, '\n');

  // 5. Simulate multiple participants
  console.log('5. Simulating participants...');
  const participants = [];
  for (let i = 1; i <= 5; i++) {
    participants.push({
      id: `user-${i}`,
      name: `Test User ${i}`,
      role: i === 1 ? 'teacher' : 'student'
    });
  }
  console.log('✓ Created', participants.length, 'participants\n');

  // 6. Test event system
  console.log('6. Testing event system...');
  const eventSystem = playground.getEventSystem();
  if (eventSystem) {
    console.log('✓ Event system accessible\n');
  }

  // 7. Test communication system
  console.log('7. Testing communication system...');
  const commsSystem = playground.getCommunicationSystem();
  if (commsSystem) {
    console.log('✓ Communication system accessible\n');
  }

  // 8. Cleanup
  console.log('8. Cleaning up...');
  playground.shutdown();
  console.log('✓ Server shutdown\n');

  console.log('=== Integration Test Complete ===');
  console.log('✓ All tests passed!');

  process.exit(0);
}

integrationTest().catch(error => {
  console.error('❌ Integration test failed:', error);
  process.exit(1);
});
```

Run the integration test:
```bash
cd ~/test-teaching-playground
npx tsc integration-test.ts
node integration-test.js
```

---

## 6. Pre-Publish Checklist

Before publishing, verify everything is ready:

### Package Quality Checks

```bash
cd /home/user/teaching-playground-core

# 1. Clean install
rm -rf node_modules pnpm-lock.yaml
pnpm install

# 2. Run linter
pnpm run lint

# 3. Run all tests
pnpm test

# 4. Clean build
rm -rf dist/
pnpm run build

# 5. Verify package contents
npm pack --dry-run
```

### Checklist

- [ ] All tests pass (`pnpm test`)
- [ ] No linting errors (`pnpm run lint`)
- [ ] Build succeeds without errors (`pnpm run build`)
- [ ] Package.json version is correct
- [ ] README.md is up to date
- [ ] LICENSE file exists
- [ ] .npmignore excludes development files
- [ ] Type definitions (`.d.ts`) are generated
- [ ] Tested with `npm pack` in separate project
- [ ] Integration tests pass
- [ ] Git changes are committed
- [ ] Changelog is updated (if applicable)

### Version Check

```bash
# Check current version
npm version

# If you need to bump version:
npm version patch  # 1.0.2 -> 1.0.3 (bug fixes)
npm version minor  # 1.0.2 -> 1.1.0 (new features)
npm version major  # 1.0.2 -> 2.0.0 (breaking changes)
```

### Final Verification

```bash
# Create tarball
npm pack

# Inspect tarball
tar -tzf teaching-playground-core-1.0.2.tgz | head -20

# Check package size
ls -lh teaching-playground-core-1.0.2.tgz

# Verify package metadata
npm view . --json
```

---

## Publishing

Once all tests pass and verification is complete:

```bash
# Login to npm (first time only)
npm login

# Publish the package
npm publish

# Verify publication
npm view @teaching-playground/core
```

---

## Troubleshooting

### Issue: "Module not found" in test project

**Solution:**
```bash
# Ensure package is properly installed
cd ~/test-teaching-playground
rm -rf node_modules package-lock.json
npm install /home/user/teaching-playground-core/teaching-playground-core-1.0.2.tgz
```

### Issue: TypeScript types not working

**Solution:**
```bash
# Check that .d.ts files exist
ls -la /home/user/teaching-playground-core/dist/index.d.ts

# Verify package.json "types" field points to correct file
cat /home/user/teaching-playground-core/package.json | grep types
```

### Issue: Package is too large

**Solution:**
```bash
# Check what's being included
npm pack --dry-run

# Verify .npmignore is working
cat .npmignore

# Check actual package size
du -sh dist/
```

### Issue: Missing dependencies in test project

**Solution:**
```bash
# Install peer dependencies
npm install typescript@^5.0.0

# Install runtime dependencies (these should be in package dependencies)
npm install socket.io socket.io-client
```

---

## Best Practices

1. **Always test with `npm pack` before publishing** - It simulates the exact package that will be published
2. **Test in a clean environment** - Use a separate directory with fresh `npm install`
3. **Test both CommonJS and ESM imports** - If you support both
4. **Verify type definitions** - Ensure TypeScript users get proper IntelliSense
5. **Check package size** - Keep it lean by excluding unnecessary files
6. **Test on different Node versions** - Use nvm to test on multiple versions
7. **Document breaking changes** - Update CHANGELOG.md
8. **Semantic versioning** - Follow semver strictly

---

## Quick Test Script

Save this as `test-package.sh` for quick testing:

```bash
#!/bin/bash

echo "=== Teaching Playground Core - Package Test ==="
echo ""

# Clean build
echo "1. Cleaning previous build..."
rm -rf dist/
rm -f *.tgz

# Install dependencies
echo "2. Installing dependencies..."
pnpm install

# Run tests
echo "3. Running tests..."
pnpm test

# Build
echo "4. Building package..."
pnpm run build

# Create tarball
echo "5. Creating package tarball..."
npm pack

# Show contents
echo "6. Package contents:"
npm pack --dry-run

echo ""
echo "=== Test Complete ==="
echo "Tarball created: teaching-playground-core-1.0.2.tgz"
echo ""
echo "Next steps:"
echo "  1. Test in separate project: npm install $(pwd)/teaching-playground-core-1.0.2.tgz"
echo "  2. If tests pass: npm publish"
```

Make it executable and run:
```bash
chmod +x test-package.sh
./test-package.sh
```

---

## Summary

The recommended testing workflow:

1. **Run unit tests**: `pnpm test`
2. **Build package**: `pnpm run build`
3. **Create tarball**: `npm pack`
4. **Test in separate project**: Create test project and install tarball
5. **Run integration tests**: Test all major features
6. **Verify package contents**: Check what will be published
7. **Publish**: `npm publish` when everything passes

This ensures your package works exactly as expected before it goes live on npm!
