#!/bin/bash
# Marie tick — calls the worker + no-reply sweep endpoint.
# Run every 5 minutes via PM2 cron.

set -euo pipefail
cd /root/my-app

TOKEN="${MARIE_INTERNAL_TOKEN:?MARIE_INTERNAL_TOKEN is required}"

# The worker and sweep guard themselves: if automation is disabled, they no-op.
curl -s -X POST \
  -H "authorization: Bearer $TOKEN" \
  -H "content-type: application/json" \
  http://127.0.0.1:3001/api/internal/marie/tick \
  -d '{}' \
  --max-time 30 \
  2>&1 || true
