#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Teaching Playground Core - Package Testing Script       ║${NC}"
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo ""

# Get package directory (script location)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PACKAGE_DIR"

echo -e "${YELLOW}📁 Package directory: ${PACKAGE_DIR}${NC}"
echo ""

# Step 1: Clean previous build
echo -e "${BLUE}[1/8]${NC} ${YELLOW}Cleaning previous build...${NC}"
rm -rf dist/
rm -f *.tgz
echo -e "${GREEN}✓ Cleaned${NC}"
echo ""

# Step 2: Install dependencies
echo -e "${BLUE}[2/8]${NC} ${YELLOW}Installing dependencies...${NC}"
if command -v pnpm &> /dev/null; then
    pnpm install --frozen-lockfile
else
    npm install
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 3: Run linter
echo -e "${BLUE}[3/8]${NC} ${YELLOW}Running linter...${NC}"
if command -v pnpm &> /dev/null; then
    pnpm run lint
else
    npm run lint
fi
echo -e "${GREEN}✓ Linting passed${NC}"
echo ""

# Step 4: Run tests
echo -e "${BLUE}[4/8]${NC} ${YELLOW}Running tests...${NC}"
if command -v pnpm &> /dev/null; then
    pnpm test
else
    npm test
fi
echo -e "${GREEN}✓ Tests passed${NC}"
echo ""

# Step 5: Build package
echo -e "${BLUE}[5/8]${NC} ${YELLOW}Building package...${NC}"
if command -v pnpm &> /dev/null; then
    pnpm run build
else
    npm run build
fi
echo -e "${GREEN}✓ Build successful${NC}"
echo ""

# Step 6: Verify build output
echo -e "${BLUE}[6/8]${NC} ${YELLOW}Verifying build output...${NC}"
if [ ! -f "dist/index.js" ]; then
    echo -e "${RED}✗ Error: dist/index.js not found${NC}"
    exit 1
fi
if [ ! -f "dist/index.d.ts" ]; then
    echo -e "${RED}✗ Error: dist/index.d.ts not found${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Build output verified${NC}"
echo ""

# Step 7: Create tarball
echo -e "${BLUE}[7/8]${NC} ${YELLOW}Creating package tarball...${NC}"
npm pack
TARBALL=$(ls -t *.tgz | head -1)
echo -e "${GREEN}✓ Created: ${TARBALL}${NC}"
echo ""

# Step 8: Show package contents
echo -e "${BLUE}[8/8]${NC} ${YELLOW}Package contents preview:${NC}"
npm pack --dry-run
echo ""

# Summary
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                  ✓ ALL CHECKS PASSED!                      ║${NC}"
echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo ""

echo -e "${YELLOW}📦 Package ready: ${TARBALL}${NC}"
echo ""

# Show package size
TARBALL_SIZE=$(ls -lh "$TARBALL" | awk '{print $5}')
echo -e "${BLUE}Package size: ${TARBALL_SIZE}${NC}"
echo ""

echo -e "${YELLOW}Next steps:${NC}"
echo -e "  ${GREEN}1.${NC} Test in a separate project:"
echo -e "     ${BLUE}npm install ${PACKAGE_DIR}/${TARBALL}${NC}"
echo ""
echo -e "  ${GREEN}2.${NC} If tests pass, publish to npm:"
echo -e "     ${BLUE}npm publish${NC}"
echo ""
echo -e "  ${GREEN}3.${NC} Or use the quick test script:"
echo -e "     ${BLUE}./scripts/test-in-project.sh${NC}"
echo ""
