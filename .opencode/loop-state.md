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
