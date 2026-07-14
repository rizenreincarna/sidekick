#!/bin/sh
# Apply the daily-summary agenda patch and rebuild the Next.js app.
# Run this from the Next.js project root (e.g. /home/z/my-project) on the build server.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PATCH_FILE="$SCRIPT_DIR/deploy-daily-summary.patch"
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"

echo "=== Applying daily-summary agenda patch ==="
echo "Project dir: $PROJECT_DIR"
echo "Patch file:  $PATCH_FILE"

if [ ! -f "$PATCH_FILE" ]; then
    echo "ERROR: patch file not found at $PATCH_FILE"
    exit 1
fi

cd "$PROJECT_DIR" || exit 1

# Apply patch from project root so paths match src/lib/... and src/app/api/...
git apply --whitespace=nowarn "$PATCH_FILE" || {
    echo "git apply failed (maybe already applied?). Trying patch tool..."
    patch -p1 < "$PATCH_FILE" || {
        echo "ERROR: could not apply patch. Check for conflicts."
        exit 1
    }
}

echo "=== Patch applied. Rebuilding ==="
export NEXT_TELEMETRY_DISABLED=1

# Install deps if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    bun install
fi

echo "Building Next.js..."
bun run build

echo ""
echo "=== DONE ==="
echo "Daily-summary agenda patch applied and rebuilt."
echo "Restart the Next.js server (e.g. sh .zscripts/start.sh) to serve the new build."