# In-App Navigation — HERO Sidekick

Google Maps–style turn-by-turn navigation built entirely on open-source
infrastructure. **No Google Maps JavaScript API, no Google Directions API, no
Mapbox, no paid keys.**

| Concern | Technology |
|---|---|
| Map rendering | MapLibre GL JS (`maplibre-gl`) |
| Basemap | OpenStreetMap (raster fallback built-in; vector style via env) |
| Routing / steps | Self-hosted OSRM (Docker, port 5000) |
| Stop order | VROOM (unchanged — OSRM only supplies road geometry + maneuvers) |
| Geometry math | Custom geo utils + `@turf/turf` available |
| GPS | Browser Geolocation API (`watchPosition`) |
| Voice | Browser SpeechSynthesis / Android native TTS bridge |
| Screen awake | Screen Wake Lock API + Android `keepScreenOn` |

## User flow

1. `/route` → pick date → **Optimize** (VROOM, unchanged).
2. **Start Route** → saves the route with status `STARTED` (unchanged) →
   automatically enters **`/route/navigate?date=YYYY-MM-DD`**.
3. Full-screen driver mode: 3D follow camera, maneuver banner, ETA/distance/
   time panel, voice guidance, off-route rerouting, arrival detection,
   stop-by-stop completion, final completion screen.
4. The header **Navigate** button on the planner re-enters navigation anytime.

## Routes & files

- Page: `src/app/route/navigate/page.tsx` (auth-guarded, Suspense)
- Client: `src/components/navigation-client.tsx` (orchestrator)
- Map: `src/components/navigation-map-maplibre.tsx` (client-only, `ssr:false`)
- UI: `navigation-maneuver-card.tsx`, `navigation-bottom-panel.tsx`,
  `navigation-exit-dialog.tsx`
- Engine: `src/hooks/use-navigation-engine.ts` (state machine)
- GPS: `src/hooks/use-driver-location.ts`
- Voice: `src/hooks/use-speech-navigation.ts`
- Wake lock: `src/hooks/use-wake-lock.ts`
- Libs: `src/lib/geo-utils.ts`, `src/lib/osrm.ts`, `src/lib/navigation.ts`
- APIs:
  - `GET /api/route/navigation?date=` — saved route + status + tracking tokens
  - `POST /api/navigation/route` — auth-protected OSRM proxy (5-min cache,
    only coordinates leave the server)

## Configuration (`.env`)

```bash
OSRM_INTERNAL_URL=http://127.0.0.1:5000      # server-side only
NEXT_PUBLIC_MAP_STYLE_URL=                    # empty = built-in OSM raster style
NEXT_PUBLIC_MAP_ATTRIBUTION=© OpenStreetMap contributors
NEXT_PUBLIC_ENABLE_3D_BUILDINGS=true          # only with a vector style
NEXT_PUBLIC_MAP_DARK_FILTER=true              # dark filter on the map canvas only
```

`NEXT_PUBLIC_*` values are inlined at build time — `bun run build` after
changing them, then restart the PM2 process.

OSRM setup: see `docs/osrm-setup.md`.

## Behavior details

- **Start**: uses live GPS as origin; falls back to HOME with a warning.
- **Off-route**: cross-track error > 40 m for ~4 s → reroute (15 s cooldown),
  same destination stop is kept.
- **Arrival**: within 35 m with decent accuracy, or within 80 m while
  stationary ~6 s. Completion is always a manual tap (safe with poor GPS).
- **Offline routing**: if OSRM fails, a straight-line fallback leg is used
  with an "Offline routing" warning — never Google.
- **Resume**: lightweight session (date + stop index + mute) in localStorage;
  a "Resume navigation" prompt appears when it matches the route date.
- **Simulation**: append `?simulate=1` — animates the driver along the active
  leg and does NOT report location to `/api/driver/location`.
  Optional `&speed=60` (m/s, 2–120, default ~11) for fast testing.

## Android WebView (dev APK: `/root/sidekickdev-webview-apk`)

Already present: `ACCESS_FINE_LOCATION`, `setGeolocationEnabled(true)`,
`onGeolocationPermissionsShowPrompt` (auto-grant), `AndroidTTS` native TTS
bridge, `AndroidGps` foreground-service bridge.

Added for navigation:

- `AndroidBridge.setKeepScreenOn(on)` JS bridge + automatic
  `webView.keepScreenOn` whenever the loaded URL contains `/route/navigate`.
- `AndroidBridge.startGpsTracking()` / `stopGpsTracking()` zero-arg aliases
  used by the web navigation screen (falls back to `AndroidGps.start(date)`).

Build & install (requires Android SDK + Gradle):

```bash
cd /root/sidekickdev-webview-apk
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

> ⚠️ Build status note: the Kotlin changes are complete, but the local Gradle
> build currently fails in this environment with a corrupted dependency-cache
> error (`Problems reading data from Binary store … offset 0`) unrelated to
> the code. Rebuild on a machine with a healthy Gradle cache before shipping.

## Ops notes

- The dev PM2 process (`sidekick-dev`) must be started with a **clean
  environment** — the server reads `.env` (dev DB, dev NEXTAUTH_URL/secret).
  If the PM2 process env contains `DATABASE_URL`/`NEXTAUTH_*` pointing at
  production, the dev app silently reads/writes the PRODUCTION database.
  Restart recipe: `pm2 delete sidekick-dev && cd .next/standalone &&
  env -i HOME=/root PATH=$PATH PORT=3002 NODE_ENV=production pm2 start server.js --name sidekick-dev`.
- Dev DB schema sync: `env -u DATABASE_URL bunx prisma db push` (the shell
  session exports a PROD `DATABASE_URL` — always unset it for DB scripts).

## Manual test checklist

Web (`https://sidekickdev.rizen.space`):

- [ ] `/route` → Optimize → map + summary panel still work (no regressions)
- [ ] Start Route → lands on `/route/navigate` full-screen, status STARTED
- [ ] Map renders (dark), OSM attribution visible, no Google calls in Network tab
- [ ] Maneuver card shows instruction + distance; updates while driving
- [ ] Voice guidance speaks; mute toggle persists after refresh
- [ ] Off-route: drive off the line > 40 m → "Rerouting…" → new leg, same stop
- [ ] Arrival banner + vibration near a stop → Complete Pickup → order COMPLETED
- [ ] Next leg starts automatically; drop-off and home targets included
- [ ] Finish Route → completion screen with stats
- [ ] Recenter / overview / exit dialog all work
- [ ] Refresh mid-route → Resume navigation restores the active stop
- [ ] `?simulate=1` animates along the leg; driver location NOT reported
- [ ] OSRM stopped → "Offline routing" straight-line fallback appears

Android WebView (dev APK):

- [ ] Location permission granted → GPS works inside the shell
- [ ] Screen stays awake on `/route/navigate`, sleeps normally elsewhere
- [ ] Voice guidance audible via native TTS
- [ ] Push notifications + tracking links still work
