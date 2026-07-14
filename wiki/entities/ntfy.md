---
title: ntfy
created: 2026-07-08
updated: 2026-07-08
type: entity
tags: [infra, notification, push, self-hosted]
confidence: high
sources: []
---

# ntfy

Self-hosted push notification server that replaced [[firebase|Firebase FCM]] for the [[sidekick-app]]. ntfy is a simple HTTP pub-sub server — POST a message to a topic URL and subscribers receive it instantly via long-poll or SSE. No Google Play Services, no OAuth, no service-account keys required.

## Deployment

| Detail | Value |
|--------|-------|
| URL | `https://ntfy.erthsidekick.xyz` |
| Server | Local systemd service on port 2586 |
| Proxy | Caddy reverse-proxy with TLS, SSE/WebSocket support |
| Binary | `/usr/local/bin/ntfy` |
| Config | `/etc/ntfy/server.yml` |
| Cache | `/var/lib/ntfy/cache.db` (12h retention) |
| Since | 6 July 2026 |

## Configuration

Config via `server.yml`:
```yaml
listen-http: "127.0.0.1:2586"
behind-proxy: true
base-url: "https://ntfy.erthsidekick.xyz"
cache-file: "/var/lib/ntfy/cache.db"
cache-duration: "12h"
```

Caddy proxy block allows long-lived SSE connections with `flush_interval -1` and 24h read/write timeouts.

## How Push Works

1. The Android app generates a unique random topic string and registers it via `POST /api/devices/register` — stored in the `DeviceToken` table as `token`.
2. The app subscribes to its topic URL via SSE/foreground service. On disconnect, it falls back to polling.
3. Server-side code calls `sendPushToUser()` / `sendPushToUsers()` from `src/lib/ntfy.ts`, which POSTs JSON to each device's topic on the ntfy server.
4. ntfy delivers the message to the connected subscriber. If offline, the 12h cache holds it for delivery on reconnection.

## Code

- `src/lib/ntfy.ts` — Push sender (replaces old `src/lib/fcm.ts`)
- Supports channels: `orders`, `sos`, `system`, `chat`
- Config via `Setting` table keys: `ai_ntfy_url`, `ai_ntfy_token`
- Default URL: `https://ntfy.erthsidekick.xyz`

## Related

- [[sidekick-app]] consumes ntfy for all push notifications
- [[pm2]] manages the server-side app that sends pushes
- Old Firebase FCM is fully replaced — `fcm.ts` still exists as dead code
