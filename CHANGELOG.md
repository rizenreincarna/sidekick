# HERO Sidekick — Changelog

## [Unreleased] — Production (sidekick.rizen.space)

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

---

## [0.2.0] — Prior to navigation v2 release
See git history and previous release notes for earlier changes.
