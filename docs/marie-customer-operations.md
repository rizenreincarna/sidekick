# Marie Customer Operations Foundation

## Scope and safety

This pass provides a disabled `DRY_RUN` foundation. Outbound automation and inbound processing have independent hard-locked kill switches. The WAHA endpoint can authenticate, validate, deduplicate, and record body-free diagnostics, but returns `DIAGNOSTIC_ONLY` while `inboundProcessingEnabled=false`.

The canonical lifecycle is `PENDING -> SCHEDULED -> CONTACTED -> BOOKED -> COMPLETED`, with `CANCELED` as a terminal side path. `CONFIRMED` is accepted only by boundary normalization during migration and API compatibility; canonical writes use `CONTACTED`.

## Architecture

- `src/lib/order-status.ts`: canonical statuses, labels, legacy normalization, and strict normal transitions.
- `src/lib/marie-operations.ts`: pure phone, MYT window, mode, capacity, lifecycle, template, intent, and redacted planning policies.
- `src/lib/marie-dry-run.ts`: read-only Prisma queries and foundational planning. It reads all pending orders without a result cap, reports the source count with `truncated=false`, and does not call `autoSchedule`, because that function mutates zones and orders.
- `MarieAutomationConfig`: disabled in `DRY_RUN`; the API schema rejects `enabled=true`, `PILOT`, and `LIVE` in this foundation and contains no provider secret.
- `CustomerConversation` and `CustomerMessage`: durable thread and provider-id/idempotency records. Raw body is allowed only in the restricted message record, never in audit/event metadata.
- `AutomationJob`: durable queue shape with idempotency, lease, attempts, expired-lease recovery, reconciliation-required states, and due-time indexes.
- `AutomationRateReservation`: per-owner MYT hour/day reservations made before provider calls. `SENDING`, acknowledged, and uncertain sends retain reservations.
- `CustomerEscalation`, `OrderHold`, and `AutomationEvent`: separate escalation, suitability, and audit state. Their nullable order foreign keys use `SET NULL`, preserving operational history if an order is deleted. Conversations are also preserved; conversation-owned messages cascade only when a conversation itself is deliberately deleted.

Admin-only endpoints are `GET/PUT /api/marie/config`, `GET /api/marie/status`, `POST /api/marie/dry-run`, and no-op `POST /api/marie/reconcile`. Internal endpoints are authenticated WAHA/Telegram webhooks, `GET /api/internal/marie/readiness`, and `POST /api/internal/marie/tick`. The tick remains a no-call disabled response under the hard-locked config.

## Environment placeholders

Set values through the existing secret mechanism, never source control:

```dotenv
MARIE_INTERNAL_TOKEN=<long-random-internal-token>
MARIE_WAHA_API_URL=http://127.0.0.1:3010
MARIE_WAHA_SESSION=naz
MARIE_WAHA_API_KEY=<secret-if-enabled-by-waha>
MARIE_WAHA_WEBHOOK_SECRET=<long-random-webhook-secret>
TELEGRAM_BOT_TOKEN=<bot-token>
MARIE_TELEGRAM_OWNER_ID=<verified-private-chat-user-id>
MARIE_TELEGRAM_WEBHOOK_SECRET=<telegram-secret-token>
```

The current Prisma config remains authoritative for `DATABASE_URL`. Do not guess the database path.

## Privacy and trust

Customer input, database notes, webhook payloads, and external text are untrusted data. Never include raw customer bodies in `AutomationEvent.metadata`, logs, Telegram approval records, dry-run reports, or Engraphis. Dry-run output uses sequential opaque order and hero references and excludes names, phones, addresses, coordinates, internal IDs, chat IDs, and message bodies. Capacity and blocked calendars are computed independently per hero.

Calendar parity follows the active scheduler: off-days and full-day event dates block every order, while public holidays and weekends block office orders only. Non-office orders remain eligible on holidays and weekends when all other foundational checks pass.

Engraphis may store only reusable operator-approved business rules in workspace `marie`, or genuinely shared rules in `shared`. It must not store names, phones, addresses, raw messages, credentials, tokens, or customer claims as policy. Current application data and direct operator instructions outrank memory.

## Remaining activation gates

Shared scheduler policy, provider adapters, envelope/message idempotency, acknowledgement ordering, Telegram private-owner correlation, and restart recovery are implemented. PILOT remains blocked until a separate reviewed activation change permits both `enabled=true` and `inboundProcessingEnabled=true` after operator approval.
