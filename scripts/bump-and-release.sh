#!/bin/bash
#
# bump-and-release.sh — Bump version of all packages, commit, tag, and publish to npm.
#
# Usage:
#   ./scripts/bump-and-release.sh patch    # 1.0.5 → 1.0.6
#   ./scripts/bump-and-release.sh minor    # 1.0.5 → 1.1.0
#   ./scripts/bump-and-release.sh major    # 1.0.5 → 2.0.0
#
# If a previous run failed mid-way, re-running with the same argument will
# resume from where it left off (skips bump if already done).
#
set -euo pipefail

BUMP_TYPE="${1:-}"

if [ -z "$BUMP_TYPE" ]; then
  echo "Usage: $0 <patch|minor|major>"
  exit 1
fi

if [ "$BUMP_TYPE" != "patch" ] && [ "$BUMP_TYPE" != "minor" ] && [ "$BUMP_TYPE" != "major" ]; then
  echo "Error: argument must be 'patch', 'minor', or 'major'"
  echo "Usage: $0 <patch|minor|major>"
  exit 1
fi

# Get root directory (script lives in scripts/)
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOCK_FILE="$ROOT_DIR/.release-in-progress"

# --- Pre-flight: Verify npm login ---
echo "Checking npm authentication..."
if ! npm whoami > /dev/null 2>&1; then
  echo "Error: You are not logged in to npm."
  echo "Run 'npm login' first, then retry."
  exit 1
fi
NPM_USER=$(npm whoami)
echo "  ✓ Logged in as: $NPM_USER"
echo ""

# All package.json files to bump
PACKAGES=(
  "$ROOT_DIR/package.json"
  "$ROOT_DIR/packages/dsl/package.json"
  "$ROOT_DIR/packages/compiler/package.json"
  "$ROOT_DIR/packages/extension/package.json"
  "$ROOT_DIR/packages/vscode-extension/package.json"
)

# Compiled example specs that embed the compiler version
EXAMPLE_SPECS=(
  "$ROOT_DIR/examples/playground-tests/playground-tests.tomation.json"
)

# --- Check for in-progress release (resume support) ---
if [ -f "$LOCK_FILE" ]; then
  NEW_VERSION=$(cat "$LOCK_FILE")
  echo "=== Resuming release v$NEW_VERSION ==="
  echo ""
  echo "A previous release was interrupted. Resuming from publish step..."
  echo "(Delete $LOCK_FILE manually if you want to start fresh.)"
  echo ""
else
  # --- Compute new version ---
  CURRENT_VERSION=$(grep -o '"version": *"[^"]*"' "$ROOT_DIR/package.json" | head -1 | grep -o '[0-9]*\.[0-9]*\.[0-9]*')

  if [ -z "$CURRENT_VERSION" ]; then
    echo "Error: could not read current version from package.json"
    exit 1
  fi

  # Parse version components
  IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

  if [ "$BUMP_TYPE" = "major" ]; then
    NEW_VERSION="$((MAJOR + 1)).0.0"
  elif [ "$BUMP_TYPE" = "minor" ]; then
    NEW_VERSION="$MAJOR.$((MINOR + 1)).0"
  elif [ "$BUMP_TYPE" = "patch" ]; then
    NEW_VERSION="$MAJOR.$MINOR.$((PATCH + 1))"
  fi

  echo "=== Tomation Release ==="
  echo ""
  echo "Bump: $CURRENT_VERSION → $NEW_VERSION ($BUMP_TYPE)"
  echo ""

  # --- Step 1: Bump versions ---
  echo "1. Bumping versions..."
  node - "$NEW_VERSION" "$ROOT_DIR" "${#PACKAGES[@]}" "${PACKAGES[@]}" "${EXAMPLE_SPECS[@]}" <<'NODE'
const fs = require('fs');
const path = require('path');

const version = process.argv[2];
const rootDir = process.argv[3];
const packageCount = Number(process.argv[4]);
const packageFiles = process.argv.slice(5, 5 + packageCount);
const specFiles = process.argv.slice(5 + packageCount);
const lockFile = path.join(rootDir, 'package-lock.json');
const lock = fs.existsSync(lockFile) ? JSON.parse(fs.readFileSync(lockFile, 'utf8')) : null;
const depFields = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

// Point every @tomationjs/* dependency at the new release.
function updateTomationDeps(manifest) {
  for (const field of depFields) {
    for (const name of Object.keys(manifest[field] || {})) {
      if (name.startsWith('@tomationjs/')) manifest[field][name] = `^${version}`;
    }
  }
}

for (const file of packageFiles) {
  if (!fs.existsSync(file)) {
    throw new Error(`Package manifest not found: ${file}`);
  }

  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  manifest.version = version;
  updateTomationDeps(manifest);
  fs.writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`);

  if (lock) {
    const lockKey = path.relative(rootDir, path.dirname(file)).split(path.sep).join('/');
    const entry = lock.packages && lock.packages[lockKey];
    if (entry) {
      entry.version = version;
      updateTomationDeps(entry);
    }
  }

  console.log(`   ✓ ${path.relative(rootDir, file)}`);
}

if (lock) {
  fs.writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
  console.log('   ✓ package-lock.json workspace metadata');
}

for (const file of specFiles) {
  if (!fs.existsSync(file)) {
    throw new Error(`Example spec not found: ${file}`);
  }
  const spec = JSON.parse(fs.readFileSync(file, 'utf8'));
  spec.meta = spec.meta || {};
  spec.meta.compilerVersion = version;
  fs.writeFileSync(file, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(`   ✓ ${path.relative(rootDir, file)}`);
}
NODE
  echo ""

  # --- Step 2: Git commit and tag ---
  echo "2. Committing and tagging..."
  cd "$ROOT_DIR"
  git add -A
  git commit -m "release: v$NEW_VERSION"
  git tag "v$NEW_VERSION"
  echo "   ✓ Committed and tagged v$NEW_VERSION"
  echo ""

  # Write lock file — bump is done, publish pending
  echo "$NEW_VERSION" > "$LOCK_FILE"
fi

# --- Step 3: Publish to npm ---
echo "3. Publishing to npm..."
cd "$ROOT_DIR"
npm publish --workspace=packages/dsl --access public
echo "   ✓ @tomationjs/dsl@$NEW_VERSION"
npm publish --workspace=packages/compiler --access public
echo "   ✓ @tomationjs/compiler@$NEW_VERSION"
echo ""

# --- Step 4: Push to remote ---
echo "4. Pushing to remote..."
git push
git push --tags
echo "   ✓ Pushed commits and tags"
echo ""

# --- Cleanup lock file ---
rm -f "$LOCK_FILE"

echo "=== Release v$NEW_VERSION complete ==="
