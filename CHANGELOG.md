# HERO Sidekick — Changelog

## [v1.28] — 26 Jul 2026 — Security Hardening, Code Audit & RizenCC Separation
- **Per-load shortest drop-point selection**: `stitchSolution` now computes haversine distance from the last pickup in each load to both `DROP_A` (ERTH HQ, Cyberjaya) and `DROP_B` (Section 51A, PJ) and picks the shorter one, rather than using the per-order majority rule.
- **Drop-point alternative comparison**: every load now carries an `alternative` field showing the distance, duration, and arrival times if the other drop point were used. Totals at the route level show both selected and alternative aggregate distances.
- **Target ≤100 km display**: the route summary header now shows the current total distance colored green (≤100 km) or amber (>100 km) and displays the alternative-drop total for comparison.
- **Drop-point toggle per load**: a "switch to …" button on each load header lets the user override the automatic shortest choice, re-optimizing via the API with `forceDropOffs`.
- **Drag-and-drop pickup reorder**: each pickup stop now has a grip handle (⋮⋮). Drag to reorder stops within a load; ETAs, distances, drop-off/home arrivals, and the map route overlay recalculate instantly client-side.
- **Reverse route per load**: a ⇅ button on each load header reverses all pickups in that load so the driver can see whether reversing the order produces a shorter route.
- **RouteAlternative database model**: added to Prisma schema for future per-load alternative persistence.

### Fixed — 2026-07-24
- **Client-side crash loading saved routes**: after adding `alternative` / `totalAlternative*` fields to the route model, existing saved routes in the DB caused `TypeError` because `load.alternative` was `undefined`. Fixed with server-side `normalizeRouteData()` in the preview API (auto-patches old JSON) and defensive optional-chaining guards in `route-summary-panel.tsx`.

### Changed — 2026-07-24
- Route optimizer API (`POST /api/route/optimize`) now accepts optional `forceDropOffs` array to override per-load drop points while preserving VROOM pickup order.

### Added
- **In-app turn-by-turn navigation v2** (`/route/navigate`).
  - Full-screen driver mode with 3D follow camera, maneuver cards, bottom panel, and voice guidance.
  - Uses MapLibre GL JS v6 + self-hosted OSRM (`http://127.0.0.1:5000`) for free, road-following routes.
  - GPS-aware state machine with off-route rerouting, slow-arrival detection, and offline straight-line fallback when OSRM is unreachable.
  - Resume support, exit dialog, mute toggle, overview / recenter controls, and Android WebView GPS bridge hooks.
  - New components: `navigation-client`, `navigation-map-maplibre`, `navigation-maneuver-card`, `navigation-bottom-panel`, `navigation-exit-dialog`.
  - New hooks/libs: `useNavigationEngine`, `useDriverLocation`, `useSpeechNavigation`, `useWakeLock`, `lib/navigation`, `lib/osrm`, `lib/geo-utils`.
- **Route completion persistence**: finishing the final HOME target in navigation now updates the saved route status from `STARTED` to `COMPLETED` in the database.
- **Completed-route landing state**: reloading `/route/navigate` for an already `COMPLETED` route now shows a “Route Completed” summary instead of “Route not started”.
- **Customer tracking route line**: tracking links now return OSRM road-following `routePath` geometry and render a thick, visible 3D tube line on the customer map.
- **Road-following route planner line**: the planner map now fetches OSRM road geometry for multi-stop routes and renders it as a thick 3D tube instead of a thin straight line.

### Changed
- Planner “Start Route” button now saves the route as `STARTED` and pushes the driver into `/route/navigate`.
- `/api/track/[token]/complete` and related endpoints now return road-following geometry for customer maps.

### Fixed
- **Navigation route line not rendering on raster basemap**: replaced the MapLibre GeoJSON source with an SVG `<polyline>` overlay projected via `map.project()`, avoiding MapLibre v6 GeoJSON worker deadlocks during raster tile loading.
- **Navigation camera stuck on start**: removed `map.isStyleLoaded()` guard from the rAF camera-follow block so the camera follows the driver as soon as GPS is available.
- **Random stray straight line on navigation map**: removed the leftover MapLibre `nav-route` fallback source/layer so only the SVG overlay draws the route line.
- **Thin route line on planner/tracking maps**: switched `RouteMap3D` from `THREE.Line` (`LineBasicMaterial.linewidth` is ignored by WebGL) to `THREE.TubeGeometry` with a glow underlay for real, visible line width.
- **Infinite loading map after pickup completion**: the customer tracking page now shows a “Pickup completed” card in the map area when the stop is completed, instead of an endless “Loading map…” spinner.
- **GPS-start fallback race**: navigation engine now waits for the first real GPS fix before requesting the first leg, only falling back to Home when GPS is denied/unavailable.

### Operations / Deployment
- Added production runtime dependencies: `maplibre-gl@^6.0.0`, `@types/geojson`.
- Built and restarted PM2 `sidekick-app` on port 3001.
- Resolved a lingering `next-server` zombie process that was causing `EADDRINUSE` restarts on port 3001.
- Production smoke-tested: login, `/route/navigate` confirmation screen, and completed customer tracking page all load correctly.

### Security & Audit (2026-07-26)
- Full code review remediation: 82 findings resolved across auth, API, frontend, and infrastructure.
- Auth hardened: rate limiting on all endpoints, 12+ char password policy, 2FA re-auth requirement.
- Secrets at rest encrypted with AES-256-GCM (TOTP seeds, AI API keys).
- SSRF guard blocks all private/internal IPs including IPv6.
- Cross-tenant authorization enforced for tracking, batch, and verify-address endpoints.
- XSS eliminated in Three.js labels and effect dependencies.
- Navigation resume, skip-all, concurrency, and slow-arrival edge cases hardened.
- CSP + HSTS security headers; PM2 and Nginx hardened (loopback bind, timeouts, body cap).
- Database REINDEX fixed index corruption; daily backup cron with integrity verification.
- 22 regression tests added for secrets, SSRF, rate limiter, navigation state, XSS.
- Light/dark map toggle on all pages with localStorage persistence.
- Production promoted: dev merged to sidekick.rizen.space.
- Corrected HERO Sidekick v1.27 APK delivered (package `space.rizen.sidekick`).
- RizenCC separated into standalone repo (package `com.rizencc`), removed from Sidekick repositories.

---

## [0.2.0] — Prior to navigation v2 release
See git history and previous release notes for earlier changes.
