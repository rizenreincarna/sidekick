#!/usr/bin/env bash
# ============================================================================
# OSRM self-hosting setup for HERO Sidekick in-app navigation (Malaysia)
#
# Downloads the OpenStreetMap extract, builds the OSRM routing dataset with
# Docker, and starts osrm-routed on port 5000 (MLD algorithm).
#
# Usage:
#   ./scripts/setup-osrm-malaysia.sh [extract-name]
#
#   extract-name defaults to "malaysia" (whole Malaysia). For small VPS
#   instances use a smaller Geofabrik extract, e.g.:
#   ./scripts/setup-osrm-malaysia.sh klang-valley
#
# Requirements: docker, wget, several GB free disk + RAM (whole Malaysia MLD
# needs roughly 4–8 GB RAM during preprocessing; the Klang Valley extract is
# far lighter).
# ============================================================================
set -euo pipefail

EXTRACT="${1:-malaysia}"
DATA_DIR="$(pwd)/osrm-data"
PBF_URL="http://download.geofabrik.de/asia/${EXTRACT}-latest.osm.pbf"
PBF_FILE="${DATA_DIR}/${EXTRACT}-latest.osm.pbf"
OSRM_BASE="${DATA_DIR}/${EXTRACT}-latest.osrm"

echo "==> OSRM data directory: ${DATA_DIR}"
mkdir -p "${DATA_DIR}"

if [ ! -f "${PBF_FILE}" ]; then
  echo "==> Downloading ${PBF_URL}"
  wget -c "${PBF_URL}" -O "${PBF_FILE}"
else
  echo "==> Extract already downloaded: ${PBF_FILE}"
fi

echo "==> [1/3] osrm-extract (road network, car profile)"
docker run --rm -t -v "${DATA_DIR}:/data" osrm/osrm-backend \
  osrm-extract -p /opt/car.lua "/data/$(basename "${PBF_FILE}")"

echo "==> [2/3] osrm-partition"
docker run --rm -t -v "${DATA_DIR}:/data" osrm/osrm-backend \
  osrm-partition "${OSRM_BASE}"

echo "==> [3/3] osrm-customize"
docker run --rm -t -v "${DATA_DIR}:/data" osrm/osrm-backend \
  osrm-customize "${OSRM_BASE}"

cat <<EOF

============================================================================
Dataset ready. Start the routing server with:

  docker run --rm -t -i -p 5000:5000 -v ${DATA_DIR}:/data osrm/osrm-backend \\
    osrm-routed --algorithm mld ${OSRM_BASE}

or use docker compose:

  docker compose -f docker-compose.osrm.yml up -d

Then verify with:

  curl "http://127.0.0.1:5000/route/v1/driving/101.686855,3.139003;101.693207,3.157889?overview=full&geometries=geojson&steps=true"

Finally, point the app at it (server-side only, never NEXT_PUBLIC):

  OSRM_INTERNAL_URL=http://127.0.0.1:5000

and rebuild: bun run build && pm2 restart sidekick-dev
============================================================================
EOF
