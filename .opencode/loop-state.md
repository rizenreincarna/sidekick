# Loop: Orders tab filter/sort fix (sidekick.rizen.space)

## Root cause (verified)
- createdAt stored as DATETIME, Prisma serializes ISO. Client toTs parses ISO fine.
- 47 same-second createdAt ties (bulk imports). 3 EVENT-* share the NEWEST createdAt
  (2026-08-07T06:04:15) → they legitimately lead createdAt DESC = looks "pinned".
- Tie order undefined → unstable/arbitrary within a batch → "latest not first".
- ALL filter predicate is correct; pending not date-excluded. Only user `naz` has data.

## Fix plan
1. Client: robust ts parse + deterministic tie-break (createdAt desc, then numeric orderId desc, then id).
2. API: stable orderBy [createdAt desc, id desc] so base order deterministic.
3. Unit test the comparator + ALL-keeps-pending predicate.
4. type-check + vitest + rebuild + pm2 restart + live browser verify.

## Rounds
- Round 1 (target): deterministic true-recency sort + stable API order + tests.

## Round 1 result
- Client sort → src/lib/order-sort.ts (compareOrders + toTimestamp UTC space-form fix).
- API orderBy → [createdAt desc, id desc] (deterministic base order).
- Tests: src/lib/order-sort.test.ts (10). Found+fixed real edge: V8 parses SQLite
  space-form date as LOCAL time; must force UTC. Found+fixed 2 wrong test oracles.
- tsc exit 0. Full vitest 127/127 green.
- Next: build, pm2 restart sidekick-app, live browser verify.

## Round 2 result (root cause + fix)
- Live probe surfaced REAL bug: ?all=true&limit=200 → 500. Two causes:
  (a) 2 orphan orders (userId='user_default') → include:user returns null → Prisma
      "Field user is required" throw. My id-desc sort pushed them past limit-100 →
      surfaced at limit 200 (the ALL-view fetch). Fixed: null-safe include + fallback.
  (b) THE pending-invisible cause: 11 PENDING orders stored createdAt as INTEGER
      epoch-millis (not SQLite datetime text like all 287 others). SQLite ORDER BY
      createdAt DESC sorts integer > text → dumped to bottom (page 2, invisible in
      ALL view). Also Date.parse("1786355428839")=NaN → client sinked them too.
      Fixed: normalized 18 Order + 35 AuditLog integer-epoch timestamps to
      'YYYY-MM-DD HH:MM:SS' text. DB backed up to db/custom.db.bak-20260810-182349.

## Final live verification (admin session, https://sidekick.rizen.space)
- createdAt strictly desc across all 298 orders: PASS
- Top of Latest-created-first = 26306 PENDING (true newest): PASS
- ALL view contains all 11 PENDING (missing=0): PASS
- PENDING appear at top (maxIdx=10): PASS
- repeat-call identical order (deterministic): PASS
- no NaN createdAt: PASS
- Browser render: "Show All Users' Orders" → 200 orders, top = 26306..26302 PENDING
  with Pending badges; sort selector = "Latest created first". Screenshot captured.

## Status: DONE — loop converged, no further rounds.

## Loop 2 — ERTHBOX-023 not at top of Latest-created-first
ROOT CAUSE (deeper than Loop 1): Prisma 6.11 SQLite driver writes DateTime as
INTEGER epoch-millis (proven by live create probe). Legacy rows were datetime
TEXT. SQLite ORDER BY sorts by storage class (INTEGER > TEXT), so newly-created
orders sorted to the BOTTOM — under every text row. My Loop-1 normalize-to-text
was undone by the next Prisma create. Correct fix = normalize ALL 57 DateTime
columns to INTEGER (matches the live writer; Prisma reads both back to ISO).
FIX:
- scripts/gen-normalize-sql.js generates scripts/normalize-datetimes-int.sql
  (57 columns, idempotent). Applied to live db in a transaction. integrity ok.
- Backup: db/custom.db.bak-preint-20260810-201256
- Restarted sidekick-app (clear Prisma conn cache).
LIVE VERIFY (admin):
- createdAt strictly desc across all 301 orders; no NaN: PASS
- ERTHBOX-023 rank 0: PASS
- Fresh POST order -> rank 0 immediately: PASS (probe deleted)
- status=PENDING/BOOKED isolate correctly; invalid status 400; date & search ok
- UI: Latest-created-first top = ERTHBOX-023,022,021,26306... screenshot taken.
- tsc clean; vitest 12/12 order-sort (added epoch regression), full 127/127.
STATUS: DONE.
