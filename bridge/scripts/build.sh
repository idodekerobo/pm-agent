#!/usr/bin/env bash
# Build the draft-bridge zipapp.
# Output: bridge/dist/draft-bridge  (executable, no Python env needed by user)
#
# Usage:
#   cd bridge && ./scripts/build.sh
#
# Requires: Python 3.11+, pip

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BUILD_DIR="$ROOT/_build"
DIST_DIR="$ROOT/dist"
OUTPUT="$DIST_DIR/draft-bridge"

echo "Building draft-bridge zipapp..."

# Clean up any previous build
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR" "$DIST_DIR"

# Install runtime dependencies into the build dir
python3 -m pip install \
  click keyring "keyrings.alt" \
  httpx starlette uvicorn websockets \
  --target "$BUILD_DIR" --quiet

# Copy the package source
cp -r "$ROOT/draft_bridge" "$BUILD_DIR/"

# Build the zipapp
# --main creates a __main__.py that calls draft_bridge.cli:main
# --python sets the shebang line
python3 -m zipapp "$BUILD_DIR" \
  --python "/usr/bin/env python3" \
  --main "draft_bridge.cli:main" \
  --output "$OUTPUT"

chmod +x "$OUTPUT"

# Clean up build artifacts
rm -rf "$BUILD_DIR"

echo ""
echo "Done: $OUTPUT"
echo "Test: $OUTPUT --help"
echo "Install: cp $OUTPUT /usr/local/bin/draft-bridge"
