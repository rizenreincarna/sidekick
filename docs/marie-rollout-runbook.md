# Marie Rollout Runbook

## Gate 1: backup and migration review

1. Keep Marie disabled and in `DRY_RUN`.
2. Resolve `DATABASE_URL` from the production process without printing its credentials or contents. Confirm it points at the intended existing SQLite database.
3. Stop application writers during the approved migration window. Do not operate on a live, changing SQLite file.
4. Create a timestamped backup with SQLite's online backup command, then verify it with `PRAGMA integrity_check` against the backup. Store file permissions as owner-only.
5. Review the complete pre-Marie baseline at `prisma/migrations/20260728000000_baseline/migration.sql` and the additive migration at `prisma/migrations/20260728000100_marie_dry_run_foundation/migration.sql`.
6. For a fresh empty database, run only `prisma migrate deploy`; Prisma applies the baseline and then the additive migration normally.
7. For an existing production database only, first verify its schema fingerprint against the baseline. Create a temporary pre-Marie datamodel by checking out the schema from the commit immediately before this feature, for example `git show <pre-marie-commit>:prisma/schema.prisma > /tmp/pre-marie-schema.prisma`; review that file before use. On a disposable copy of production, run `prisma migrate diff --from-url <copy-url> --to-schema-datamodel /tmp/pre-marie-schema.prisma --exit-code`. Exit code 0 is required. Also compare `sqlite_schema` table/index/foreign-key definitions and run `PRAGMA integrity_check` and `PRAGMA foreign_key_check`. Any drift blocks rollout.
8. After the fingerprint is verified and the approved backup exists, mark only the baseline as already represented: `prisma migrate resolve --applied 20260728000000_baseline`. Do not mark the Marie migration applied.
9. Run `prisma migrate deploy` only after explicit approval. It applies all additive migrations through `20260728000500_marie_disabled_safety_controls`. Verify all tables/indexes, one config with `enabled=0`, `mode=DRY_RUN`, `inboundProcessingEnabled=0`, and `escalationEnabled=0`, zero `CONFIRMED` rows, and expected `CONTACTED` count. Run `bun scripts/verify-marie-migration.ts file:/path/to/disposable-or-approved-db.sqlite`; it requires exactly `integrity_check=ok` and no foreign-key rows.

Rollback is restore-based: stop writers, retain the failed database for investigation, replace it atomically with the verified backup, restore ownership/mode, run integrity checks, and start writers only after approval. The status update and additive tables are transactional, but SQLite rollback migrations are intentionally not improvised in production.

## Gate 2: dry run

Use authenticated `POST /api/marie/dry-run` as the primary mechanism. The optional CLI is `bun scripts/marie-dry-run.ts <output-path>` when Bun TypeScript execution is available. Its output is mode `0600` and contains no PII.

Review proposed dates, holds, point totals, route-cluster decisions, and every 21-25 point exception. The read-only planner shares the scheduler's 110km circuit and 12km cluster constraints, never geocodes, and holds missing coordinates.

## WAHA prerequisites

Do not modify `/opt/waha` or expose WAHA publicly during this foundation. Before PILOT:

1. Inspect the existing `waha` and `waha-inbound` runtime configuration without printing secrets.
2. Pair the dedicated number through WAHA's loopback-only operator interface using the configured named session.
3. Confirm outbound message IDs, self-message markers, session identity, retry behavior, and health from `127.0.0.1:3010`.
4. Replace or harden the existing WAHA inbound service before PILOT. It must use a narrow TLS webhook endpoint, authentication/signature or secret validation, request size/schema validation, rate limits, provider-message uniqueness, self-message suppression, and sanitized logs. The existing inbound must not remain as an unverified competing consumer.
5. Never set `CONTACTED` until WAHA acknowledges the outbound send and its provider message ID is committed.

Required environment placeholders (do not commit values):

```dotenv
MARIE_WAHA_WEBHOOK_SECRET=
MARIE_INTERNAL_TOKEN=
MARIE_WAHA_API_URL=http://127.0.0.1:3010
MARIE_WAHA_API_KEY=
MARIE_WAHA_SESSION=naz
TELEGRAM_BOT_TOKEN=
MARIE_TELEGRAM_OWNER_ID=
MARIE_TELEGRAM_WEBHOOK_SECRET=
```

Later, after explicit approval, configure `/opt/waha` to POST only GOWS `message` and `message.ack` webhooks to the app's authenticated `POST /api/internal/marie/waha-webhook`, using either `Authorization: Bearer <MARIE_WAHA_WEBHOOK_SECRET>` or `X-Webhook-Secret`. WAHA in Docker cannot reach a PM2 service bound only to host loopback; use the reviewed bridge-only relay template at `docs/nginx/marie-waha-bridge.conf.template`. Do not modify `/opt/waha` during foundation work. The worker endpoint is authenticated `POST /api/internal/marie/tick` using `MARIE_INTERNAL_TOKEN`.

## Telegram owner discovery

Escalations must be direct messages, never the Team Rizen group. Discover the owner ID by sending a controlled message from the owner's paired account to the existing Marie bot, then inspect the authenticated update metadata without logging message text or tokens. Verify the numeric sender ID and private chat type twice, configure only that ID, and test correlation/identity rejection in PILOT. If ownership is ambiguous, leave escalation sending disabled and ask the operator.

## Gate 3: pilot checklist

The code foundation is present but the config parser deliberately remains hard-locked to disabled `DRY_RUN`. Before a later activation change:

- Explicit normalized-phone/order allowlist and low run/hour/day limits.
- Verified WAHA identity and hardened inbound replacement.
- Verified Telegram owner DM ID and correlation checks.
- Pure full-scheduler parity, idempotent queue claims, acknowledgements, retries/dead letter, follow-up ceiling, opt-out, cancellation confirmation, and grievance escalation.
- Tests for webhook duplicates/out-of-order events, process restarts, provider downtime, cross-customer access, and prompt injection.
- Explicit operator approval after end-to-end test-number validation.
- Apply migrations first to a disposable database, run `prisma validate`, `prisma generate`, tests, typecheck, lint, and build, then repeat against a production database copy. Do not apply to production yet.
- Verify unknown senders create only body-free/PII-free unmatched records, LIDs match only existing conversations, groups and self-messages cannot trigger actions, and duplicate provider IDs are idempotent.
- Verify outbound provider IDs are persisted in the same transaction before `SCHEDULED -> CONTACTED`, leases have one winner, retry exhaustion dead-letters and escalates, and no HTTP transaction spans a provider call.
- Set normalized test-number allowlist, 08:00-20:00 MYT window, low run/hour/day limits, valid order state, no active hold, session `naz`, and required WAHA env before an injected-adapter pilot.
- Separately set `escalationEnabled`, verify `MARIE_TELEGRAM_OWNER_ID` is a numeric private user target (not a `-100...` group/channel), and test minimized direct-DM content. The Telegram approval webhook requires its secret-token header, exact owner sender/chat IDs, private chat type, open correlation ID, and the closed `APPROVE`/`REJECT` vocabulary; approved jobs remain paused until activation policy handles them.

## Gate 4: live

LIVE remains unavailable until a separate explicit approval. Retain global disable, per-order/customer pause, allowlisted pilot fallback, rate limits, circuit breaker, dead-letter review, health monitoring, and audited manual repair. Expand gradually and never treat silence or passing tests as authorization.
