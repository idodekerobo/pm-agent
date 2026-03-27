#!/usr/bin/env bash
# Install draft-bridge from the latest release.
# Usage: curl -fsSL https://draftai.us/install-bridge | bash
#
# Requires: Python 3.11+

set -euo pipefail

RELEASE_URL="https://releases.draftai.us/bridge/latest/draft-bridge"
INSTALL_PATH="/usr/local/bin/draft-bridge"

echo "Installing draft-bridge..."

# Check Python version
if ! command -v python3 &>/dev/null; then
  echo "Error: python3 is required but not found."
  echo "Install Python 3.11+ from https://python.org and try again."
  exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
REQUIRED="3.11"
if ! python3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 11) else 1)"; then
  echo "Error: Python $REQUIRED or higher is required (found $PYTHON_VERSION)."
  exit 1
fi

# Download
curl -fsSL "$RELEASE_URL" -o "$INSTALL_PATH"
chmod +x "$INSTALL_PATH"

echo ""
echo "draft-bridge installed at $INSTALL_PATH"
echo ""
echo "Next steps:"
echo "  1. draft-bridge auth     # authenticate with draftai.us"
echo "  2. draft-bridge start    # start the bridge server"
