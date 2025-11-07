# Publishing Guide for Teaching Playground Core

Complete guide for publishing and maintaining the Teaching Playground Core package on npm.

## Table of Contents

1. [First Time Setup](#first-time-setup)
2. [Publishing Workflow](#publishing-workflow)
3. [Version Management](#version-management)
4. [Updating After Bugs](#updating-after-bugs)
5. [Testing Published Package](#testing-published-package)
6. [Unpublishing (Emergency)](#unpublishing-emergency)

---

## First Time Setup

### 1. Create npm Account

If you don't have an npm account:

1. Go to https://www.npmjs.com/signup
2. Create an account
3. Verify your email address

### 2. Login to npm

```bash
# Login to npm from command line
npm login

# You'll be prompted for:
# Username: your-username
# Password: your-password
# Email: your-email@example.com
# One-time password (if 2FA enabled): 123456

# Verify you're logged in
npm whoami
```

### 3. Verify Package Name Availability

```bash
# Check if the package name is available
npm search @teaching-playground/core

# Or try to view it (should return 404 if available)
npm view @teaching-playground/core
```

**Note:** Since this is a scoped package (`@teaching-playground/core`), it belongs to the `teaching-playground` organization. You need to:
- Either own the `teaching-playground` npm organization
- Or publish as `@your-username/teaching-playground-core`

---

## Publishing Workflow

### Step 1: Pre-Publish Testing

```bash
# Navigate to package directory
cd /home/user/teaching-playground-core

# Run full test suite
pnpm test

# Lint the code
pnpm run lint

# Clean and rebuild
rm -rf dist/
pnpm run build

# Create and inspect package tarball
npm pack
npm pack --dry-run
```

### Step 2: Test Package Locally

```bash
# Create test project
mkdir -p ~/test-tp-package
cd ~/test-tp-package
npm init -y

# Install your local package
npm install /home/user/teaching-playground-core/teaching-playground-core-1.0.2.tgz

# Test imports work
cat > test.js << 'EOF'
const { TeachingPlayground } = require('@teaching-playground/core');
console.log('Import successful!', TeachingPlayground);
EOF

node test.js
```

### Step 3: Publish to npm

```bash
cd /home/user/teaching-playground-core

# Ensure you're logged in
npm whoami

# Publish (dry run first to be safe)
npm publish --dry-run

# Actually publish
npm publish

# Or publish with tag (for beta/alpha releases)
npm publish --tag beta
```

### Step 4: Verify Publication

```bash
# Check the package on npm
npm view @teaching-playground/core

# Check all available versions
npm view @teaching-playground/core versions

# Install from npm to test
mkdir -p ~/verify-publish
cd ~/verify-publish
npm init -y
npm install @teaching-playground/core

# Verify it works
node -e "console.log(require('@teaching-playground/core'))"
```

---

## Version Management

### Understanding Semantic Versioning

Version format: `MAJOR.MINOR.PATCH` (e.g., `1.0.2`)

- **PATCH** (1.0.2 → 1.0.3): Bug fixes, no breaking changes
- **MINOR** (1.0.2 → 1.1.0): New features, backward compatible
- **MAJOR** (1.0.2 → 2.0.0): Breaking changes

### Updating Version

```bash
# For bug fixes
npm version patch
# 1.0.2 → 1.0.3

# For new features (backward compatible)
npm version minor
# 1.0.2 → 1.1.0

# For breaking changes
npm version major
# 1.0.2 → 2.0.0

# Custom version
npm version 1.2.3
```

**What `npm version` does:**
1. Updates version in `package.json`
2. Creates a git commit with message "1.0.3"
3. Creates a git tag (e.g., `v1.0.3`)

### Publishing New Version

```bash
# Example: Publishing a bug fix

# 1. Make your bug fixes
# ... edit code ...

# 2. Test everything
pnpm test
pnpm run build

# 3. Bump version
npm version patch

# 4. Push to git (including tags)
git push && git push --tags

# 5. Publish to npm
npm publish

# 6. Verify
npm view @teaching-playground/core version
```

---

## Updating After Bugs

### Scenario: You published v1.0.2 but found bugs

#### Option 1: Patch Release (Recommended)

```bash
# 1. Fix the bugs in your code
cd /home/user/teaching-playground-core

# 2. Test thoroughly
pnpm test
npm pack
# ... test the package in a separate project ...

# 3. Bump patch version
npm version patch
# Now you're at v1.0.3

# 4. Commit and push
git push -u origin claude/test-playground-integration-011CUsyfTY9xpQhqhrKTaL76
git push --tags

# 5. Publish the fixed version
npm publish

# 6. Users update with:
npm update @teaching-playground/core
# or
npm install @teaching-playground/core@latest
```

#### Option 2: Deprecate Broken Version

If the bug is critical:

```bash
# Deprecate the broken version
npm deprecate @teaching-playground/core@1.0.2 "Critical bug fixed in 1.0.3"

# Users will see a warning when installing 1.0.2
```

---

## Testing Published Package

### Install from npm in Test Project

```bash
# Create fresh test project
mkdir -p ~/test-from-npm
cd ~/test-from-npm

# Initialize project
npm init -y

# Install your published package
npm install @teaching-playground/core

# Verify installation
ls -la node_modules/@teaching-playground/

# Test TypeScript types
npm install typescript @types/node

cat > test.ts << 'EOF'
import { TeachingPlayground, RoomConnection } from '@teaching-playground/core';

const playground = new TeachingPlayground(8080);
console.log('Package works!', playground);
EOF

npx tsc test.ts --esModuleInterop --moduleResolution node
node test.js
```

### Test Different Install Methods

```bash
# Install latest version
npm install @teaching-playground/core

# Install specific version
npm install @teaching-playground/core@1.0.2

# Install with pnpm
pnpm add @teaching-playground/core

# Install with yarn
yarn add @teaching-playground/core
```

### Verify Package Contents

```bash
# After installing, check what files are in the package
cd ~/test-from-npm/node_modules/@teaching-playground/core
ls -la

# Should contain:
# - dist/
# - README.md
# - LICENSE
# - package.json
# Should NOT contain:
# - src/
# - tests/
# - node_modules/
```

---

## Complete Publishing Workflow Example

Here's a complete example from finding a bug to publishing a fix:

```bash
# Day 1: Published v1.0.2
cd /home/user/teaching-playground-core
npm publish
# ✅ Published @teaching-playground/core@1.0.2

# Day 2: User reports a bug in RoomConnection
# You fix the bug in src/services/RoomConnection.ts

# Step 1: Fix the code
# ... make fixes ...

# Step 2: Add/update tests
# ... add tests to prevent regression ...

# Step 3: Test everything
pnpm test
# ✅ All tests pass

# Step 4: Test package locally
npm pack
mkdir -p ~/test-fix
cd ~/test-fix
npm install /home/user/teaching-playground-core/teaching-playground-core-1.0.2.tgz
# ... run integration tests ...
cd /home/user/teaching-playground-core

# Step 5: Bump version
npm version patch
# 📝 package.json: 1.0.2 → 1.0.3
# 📝 git commit: "1.0.3"
# 📝 git tag: v1.0.3

# Step 6: Update git
git push -u origin claude/test-playground-integration-011CUsyfTY9xpQhqhrKTaL76
git push --tags

# Step 7: Publish to npm
npm publish
# ✅ Published @teaching-playground/core@1.0.3

# Step 8: Verify
npm view @teaching-playground/core

# Step 9: Notify users
# - Update GitHub release
# - Post in your project's Discord/Slack
# - Update documentation if needed

# Users update with:
npm install @teaching-playground/core@latest
```

---

## Publishing to Different Channels

### Production Release (Latest)

```bash
# Default - users get this with `npm install`
npm publish
```

### Beta Release

```bash
# Update version to include beta
npm version 1.1.0-beta.1

# Publish with beta tag
npm publish --tag beta

# Users install with:
npm install @teaching-playground/core@beta
```

### Alpha/Development Release

```bash
# Update version
npm version 1.2.0-alpha.1

# Publish with alpha tag
npm publish --tag alpha

# Users install with:
npm install @teaching-playground/core@alpha
```

### Promoting Beta to Latest

```bash
# After beta testing is successful

# Remove beta tag
npm version 1.1.0

# Publish as latest
npm publish

# The beta tag is automatically removed from "latest"
```

---

## Unpublishing (Emergency)

**⚠️ WARNING:** Only use in emergencies (security issues, exposed secrets, etc.)

### Unpublish Specific Version

```bash
# Unpublish a specific version (within 72 hours of publish)
npm unpublish @teaching-playground/core@1.0.2

# Note: Can only unpublish within 72 hours
```

### Deprecate Instead (Preferred)

```bash
# Mark a version as deprecated
npm deprecate @teaching-playground/core@1.0.2 "Security vulnerability - use 1.0.3+"

# Users will see warning when installing
```

### Complete Package Removal

```bash
# ⚠️ EXTREME CAUTION - Removes entire package
npm unpublish @teaching-playground/core --force

# Can only be done if:
# - No other packages depend on it
# - Less than 72 hours since publish
# - Better to deprecate instead
```

---

## Maintenance Checklist

### Before Each Release

- [ ] All tests pass (`pnpm test`)
- [ ] Code is linted (`pnpm run lint`)
- [ ] Build succeeds (`pnpm run build`)
- [ ] Package tested locally (`npm pack`)
- [ ] CHANGELOG.md updated
- [ ] Version bumped appropriately
- [ ] Git changes committed
- [ ] Git tags pushed

### After Publishing

- [ ] Verify on npm: `npm view @teaching-playground/core`
- [ ] Test installation in fresh project
- [ ] Update GitHub release
- [ ] Update documentation website (if any)
- [ ] Notify users of changes
- [ ] Close related GitHub issues

### Monthly Maintenance

- [ ] Update dependencies
- [ ] Check for security vulnerabilities
- [ ] Review and address GitHub issues
- [ ] Update documentation
- [ ] Check package download stats

---

## Useful Commands Reference

```bash
# Package info
npm view @teaching-playground/core          # View package info
npm view @teaching-playground/core versions # All versions
npm view @teaching-playground/core version  # Latest version
npm info @teaching-playground/core          # Detailed info

# Publishing
npm publish                    # Publish to latest
npm publish --dry-run          # Test publish without actually publishing
npm publish --tag beta         # Publish with tag
npm publish --access public    # Required for scoped packages (first time)

# Version management
npm version patch              # Bump patch version
npm version minor              # Bump minor version
npm version major              # Bump major version
npm version 1.2.3              # Set specific version

# Deprecation
npm deprecate @teaching-playground/core@1.0.2 "message"

# Testing
npm pack                       # Create tarball
npm pack --dry-run             # Show what will be packed
npm install ./package.tgz      # Install from local tarball

# User info
npm whoami                     # Check logged in user
npm login                      # Login to npm
npm logout                     # Logout from npm
```

---

## Quick Reference: Update & Republish Workflow

For quick reference when you need to update and republish:

```bash
# 1. Fix bugs / add features
# ... make code changes ...

# 2. Test
pnpm test && pnpm run build

# 3. Test package locally
npm pack
# Install in test project and verify

# 4. Update version (choose one)
npm version patch  # Bug fixes: 1.0.2 → 1.0.3
npm version minor  # New features: 1.0.2 → 1.1.0
npm version major  # Breaking changes: 1.0.2 → 2.0.0

# 5. Push to git
git push -u origin $(git branch --show-current)
git push --tags

# 6. Publish
npm publish

# 7. Verify
npm view @teaching-playground/core version
```

---

## Troubleshooting

### "You must sign up for private packages"

**Issue:** Scoped packages default to private

**Solution:**
```bash
npm publish --access public
```

### "You do not have permission to publish"

**Issue:** Not authenticated or wrong user

**Solution:**
```bash
npm whoami  # Check current user
npm logout
npm login   # Login with correct account
```

### "Cannot publish over existing version"

**Issue:** Version 1.0.2 already published

**Solution:**
```bash
npm version patch  # Bump to 1.0.3
npm publish
```

### "Package name too similar to existing package"

**Issue:** npm spam protection

**Solution:**
- Use a more unique name
- Or add your username: `@yourusername/teaching-playground-core`

---

## Summary

The complete lifecycle:

1. **Develop** → Make changes, add features
2. **Test** → `pnpm test` and local package testing
3. **Version** → `npm version patch/minor/major`
4. **Publish** → `npm publish`
5. **Verify** → Test installation from npm
6. **Iterate** → Repeat for updates

Remember: **Always test locally with `npm pack` before publishing!**
