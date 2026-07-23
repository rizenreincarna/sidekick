# OSRM Setup — HERO Sidekick In-App Navigation

The in-app turn-by-turn navigation mode is powered by a **self-hosted OSRM**
routing engine. No Google Directions, no Mapbox, no paid API keys.

- OSRM HTTP API docs: <https://project-osrm.org/docs/v5.24.0/api/>
- Data: OpenStreetMap extracts from Geofabrik (<https://download.geofabrik.de/>)

---

## 1. Quick start (Malaysia)

```bash
# From the repo root — downloads the extract, builds the dataset, prints run instructions
./scripts/setup-osrm-malaysia.sh

# Start the server (port 5000)
docker compose -f docker-compose.osrm.yml up -d

# Verify
curl "http://127.0.0.1:5000/route/v1/driving/101.686855,3.139003;101.693207,3.157889?overview=full&geometries=geojson&steps=true"
```

Expected: JSON with `"code":"Ok"` and a `routes[0].legs[0].steps` array.

## 2. Manual steps (what the script does)

```bash
mkdir -p osrm-data

# 1) Download the Malaysia OSM extract (~1 GB)
wget http://download.geofabrik.de/asia/malaysia-latest.osm.pbf -O osrm-data/malaysia-latest.osm.pbf

# 2) Extract the road network (car profile)
docker run --rm -t -v $(pwd)/osrm-data:/data osrm/osrm-backend \
  osrm-extract -p /opt/car.lua /data/malaysia-latest.osm.pbf

# 3) Partition the dataset (MLD)
docker run --rm -t -v $(pwd)/osrm-data:/data osrm/osrm-backend \
  osrm-partition /data/malaysia-latest.osrm

# 4) Customize the dataset
docker run --rm -t -v $(pwd)/osrm-data:/data osrm/osrm-backend \
  osrm-customize /data/malaysia-latest.osrm

# 5) Run the routing server
docker run --rm -t -i -p 5000:5000 -v $(pwd)/osrm-data:/data osrm/osrm-backend \
  osrm-routed --algorithm mld /data/malaysia-latest.osrm
```

## 3. Hardware notes

- Whole-Malaysia MLD preprocessing needs **several GB of RAM** (4–8 GB is a
  safe budget) and a few GB of disk.
- On a small VPS, use a smaller regional extract first, e.g. **Klang Valley**
  (covers KL + Selangor — the Sidekick service area):

  ```bash
  ./scripts/setup-osrm-malaysia.sh klang-valley
  # then update docker-compose.osrm.yml command to /data/klang-valley-latest.osrm
  ```

  (This server currently runs exactly that: a Klang Valley dataset in the
  `osrm` Docker container on port 5000.)
- OSRM itself is free, but it still consumes server CPU/RAM/disk.

## 4. Point the app at OSRM

`.env` (server-side only — **never** `NEXT_PUBLIC_`):

```bash
OSRM_INTERNAL_URL=http://127.0.0.1:5000
```

Then rebuild and restart:

```bash
bun run build
pm2 restart sidekick-dev   # dev only; promote to prod via release script
```

## 5. Production rules

- **Do NOT use the public OSRM demo server** (`router.project-osrm.org`) in
  production. It is rate-limited and intended for testing only.
- The app proxies all routing through `POST /api/navigation/route`, so the
  OSRM URL never reaches the browser and only coordinates (never customer
  names, phones, addresses, or order IDs) are sent to OSRM.
- Responses are cached server-side for 5 minutes (rounded-coordinate keys).

## 6. Keeping data fresh

OSM data ages. Re-run the setup script every few months to download a fresh
extract and rebuild the dataset, then restart the container:

```bash
docker compose -f docker-compose.osrm.yml down
./scripts/setup-osrm-malaysia.sh            # re-downloads + rebuilds
docker compose -f docker-compose.osrm.yml up -d
```

## 7. Troubleshooting

| Symptom | Fix |
|---|---|
| `curl :5000` refused | Container not running: `docker ps`, start with compose |
| `No route found` for local trips | Coordinates outside the extract — use a bigger extract |
| Slow first request | Normal — MLD warms up; subsequent requests are ms-fast |
| App shows "Offline routing" | App can't reach `OSRM_INTERNAL_URL` — check env + rebuild |
