#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Testing Package in Fresh Project                        ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo ""

# Get package directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"

# Find the tarball
cd "$PACKAGE_DIR"
TARBALL=$(ls -t *.tgz 2>/dev/null | head -1)

if [ -z "$TARBALL" ]; then
    echo -e "${RED}✗ No tarball found. Run './scripts/test-package.sh' first${NC}"
    exit 1
fi

echo -e "${YELLOW}📦 Using tarball: ${TARBALL}${NC}"
echo ""

# Create test project
TEST_DIR="$HOME/test-teaching-playground-$(date +%s)"
trap 'rm -rf "$TEST_DIR"' EXIT
echo -e "${BLUE}[1/6]${NC} ${YELLOW}Creating test project at ${TEST_DIR}${NC}"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"

# Initialize project
echo -e "${BLUE}[2/6]${NC} ${YELLOW}Initializing npm project...${NC}"
npm init -y > /dev/null 2>&1

# Install required dependencies
echo -e "${BLUE}[3/6]${NC} ${YELLOW}Installing TypeScript and dependencies...${NC}"
if command -v pnpm &> /dev/null; then
    pnpm add --save-dev typescript @types/node
else
    npm install --save-dev typescript @types/node
fi

# Install the package
echo -e "${BLUE}[4/6]${NC} ${YELLOW}Installing @teaching-playground/core from tarball...${NC}"
if command -v pnpm &> /dev/null; then
    pnpm add "$PACKAGE_DIR/$TARBALL"
else
    npm install "$PACKAGE_DIR/$TARBALL"
fi
echo -e "${GREEN}✓ Package installed${NC}"
echo ""

# Create test files
echo -e "${BLUE}[5/6]${NC} ${YELLOW}Creating test files...${NC}"

# Create TypeScript config
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "es2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist"
  }
}
EOF

# Create test file
cat > test-imports.ts << 'EOF'
// Test all main exports
import {
  TeachingPlayground,
  RoomConnection,
  RoomManagementSystem,
  EventManagementSystem,
  RealTimeCommunicationSystem
} from '@teaching-playground/core';

console.log('✓ All imports successful!');
console.log('');
console.log('Available exports:');
console.log('  - TeachingPlayground:', typeof TeachingPlayground);
console.log('  - RoomConnection:', typeof RoomConnection);
console.log('  - RoomManagementSystem:', typeof RoomManagementSystem);
console.log('  - EventManagementSystem:', typeof EventManagementSystem);
console.log('  - RealTimeCommunicationSystem:', typeof RealTimeCommunicationSystem);
console.log('');
console.log('✓ Package is working correctly!');
EOF

# Create basic functionality test
cat > test-functionality.ts << 'EOF'
import { createServer } from 'node:http';
import { TeachingPlayground } from '@teaching-playground/core';

async function test() {
  console.log('Testing TeachingPlayground...');

  const playground = new TeachingPlayground({});
  console.log('✓ TeachingPlayground instance created');

  const server = createServer();
  playground.initialize(server);
  await new Promise<void>(resolve => server.listen(0, resolve));
  console.log('✓ Playground initialized');

  const room = await playground.createClassroom({
    name: 'Test Room',
    capacity: 50,
  });
  console.log('✓ Room created:', room.id);

  const rooms = await playground.roomSystem.listRooms();
  console.log('✓ Retrieved rooms:', rooms.length);

  await playground.shutdown();
  await new Promise<void>((resolve, reject) =>
    server.close(error => error ? reject(error) : resolve())
  );
  console.log('✓ Playground shutdown');

  console.log('');
  console.log('✓ All functionality tests passed!');
  process.exit(0);
}

test().catch(error => {
  console.error('✗ Test failed:', error);
  process.exit(1);
});
EOF

echo -e "${GREEN}✓ Test files created${NC}"
echo ""

# Run tests
echo -e "${BLUE}[6/6]${NC} ${YELLOW}Running tests...${NC}"
echo ""

echo -e "${YELLOW}═══ Test 1: TypeScript Import Test ═══${NC}"
npx tsc
node dist/test-imports.js
echo ""

echo -e "${YELLOW}═══ Test 2: Functionality Test ═══${NC}"
timeout 10s node dist/test-functionality.js
echo ""

# Summary
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              ✓ PACKAGE TESTS COMPLETED!                    ║${NC}"
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo ""

echo -e "${GREEN}✓ Package is ready to publish!${NC}"
echo ""
