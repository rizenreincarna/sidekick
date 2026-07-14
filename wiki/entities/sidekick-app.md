---
title: Sidekick App
created: 2026-07-05
updated: 2026-07-05
type: entity
tags: [project, app, dev, work]
confidence: high
sources: []
---

# Sidekick App

The HERO e-waste operations app. Located at `/root/my-app/`.

## Tech Stack
- SQLite WAL database: `db/custom.db`
- [[pm2|PM2]] managed: `hero-updater` process
- [[ntfy]] for push notifications (replaced [[firebase|Firebase FCM]])
- Git repo at `/root/my-app/` — push after every edit

## Database
- 17 tables, ~70 orders
- Uses WAL mode
- **Reserved words** (`Order`, `User`, `Group`, `Table`) must be quoted in raw sqlite3
- Prisma handles quoting automatically

## Key Operations
- Mark orders COMPLETED via `sqlite3` CLI
- Push notifications via [[ntfy]] (topic-based HTTP pub-sub)
- Payment tracking lives at `pickup-payments/YYY-MM-DD.json`

## Git
- Remote: GitHub via SSH (ed25519 key)
- User: `rizenreincarna`
- Commits from `sidekick@/root/my-app`

## Related
- The [[hero-pickup-process]] drives daily operations through this app
- [[naz]] uses Sidekick for all pickup logistics
- [[ntfy]] powers push notifications; [[pm2]] manages process lifetime
