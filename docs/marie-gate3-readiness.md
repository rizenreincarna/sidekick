# Marie Gate 3 Readiness

## Current decision

**BLOCKED for activation by design.** Runtime config parsing still forces `enabled=false`, `mode=DRY_RUN`, `inboundProcessingEnabled=false`, and `escalationEnabled=false`. The readiness endpoint always reports `readyForActivation=false` and `activationCodeUnlocked=false`.

## Prerequisites

- [x] Authenticated, size-bounded WAHA `message` and `message.ack` webhook foundation.
- [x] Envelope and provider-message idempotency, diagnostic-only inbound kill switch, exact single active-conversation matching, self/group rejection, and minimal unknown/ambiguous identity records.
- [x] Shared scheduler feasibility/scoring with 20-point normal hard cap, 110km route, resulting-centroid 12km invariant, and no-coordinate zone isolation.
- [x] Durable outbound leases, atomic `RUNNING -> SENDING` send boundary, expired-run recovery, per-owner atomic rate reservations, bounded pre-transmission retry/dead-letter, and non-retryable `SEND_UNCERTAIN` reconciliation path.
- [x] Direct private Telegram approval endpoint with secret-token, identity, chat-type, correlation, and action validation.
- [x] Bridge-only nginx template added without installation.
- [ ] Operator supplies and verifies all environment values in the readiness endpoint.
- [ ] Operator validates dedicated WAHA session `naz`, test number, webhook relay, and ACK shapes.
- [ ] Operator verifies Telegram private owner ID and webhook secret using a controlled test.
- [ ] Independent review approves migration simulation and integration evidence.
- [ ] Separate activation change unlocks PILOT config after explicit approval.

## Readiness command

Call `GET /api/internal/marie/readiness` with `Authorization: Bearer $MARIE_INTERNAL_TOKEN`. It returns booleans only and never returns secret values.

## Future connectivity

WAHA in Docker cannot directly reach an application bound only to host loopback. After approval, install a reviewed bridge-address-only relay based on `docs/nginx/marie-waha-bridge.conf.template`. Configure `/opt/waha` later, not now, to send only `message` and `message.ack` events through that relay with the shared secret header. Restrict source subnet and do not expose the relay publicly.

## Activation sequence

1. Back up and fingerprint the production database while writers are stopped.
2. Re-run fresh and existing-baseline disposable migration simulations through `20260728000500_marie_disabled_safety_controls` and require zero Prisma drift. Migration `00400` disables foreign keys before `BEGIN IMMEDIATE`, commits all rebuilds atomically, then restores enforcement; the operator must run `PRAGMA foreign_key_check` after deployment because SQLite cannot make that check abort the completed migration.
3. Configure secrets through the deployment secret store without printing them.
4. Install and validate the bridge-only relay and WAHA webhook settings during an approved window.
5. Verify readiness booleans, test-number allowlist, MYT window, holds, limits, ACKs, and Telegram owner identity.
6. Complete controlled injected-adapter and dedicated-number end-to-end tests without customer automation.
7. Obtain explicit operator approval.
8. Make a separate reviewed code change that permits enabled `PILOT` and inbound processing; do not enable `LIVE`.

## Validation record

- Prisma format/validate/generate: PASS.
- Fresh disposable migration through `20260728000500_marie_disabled_safety_controls`: PASS.
- Existing-production baseline simulation (`baseline SQL`, `migrate resolve`, additive deploy): PASS.
- SQLite `integrity_check` and `foreign_key_check`: PASS.
- Prisma migrate diff against both simulations: PASS, no difference detected.
- Automated tests: PASS, 18 files and 66 tests.
- Typecheck: PASS.
- Lint: PASS with 18 existing warnings in unrelated UI/hooks files and zero errors.
- Production build: TypeScript compilation PASS on repeated runs; the command wrapper exposed no final Next.js completion/exit summary, so full packaging remains conservatively unverified.
- PII/secrets review: webhook bodies appear only in operational `CustomerMessage.body`; unmatched LID rows contain no identifier/body; event metadata contains provider/correlation IDs and state only; readiness returns booleans only.
