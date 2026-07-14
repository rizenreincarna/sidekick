# Wiki Log

> Chronological record of all wiki actions. Append-only.
> Format: `## [YYYY-MM-DD] action | subject`
> Actions: ingest, update, query, lint, create, archive, delete

## [2026-07-03] lint | Daily lint report
- **Overall status:** 🟡 Yellow (3 issues requiring attention, 4 informational)
- **1. Schema Integrity:** ⚠️ FAIL — 1 page with invalid type
- **2. Staleness:** ⚠️ INFO — 8 pages have future-dated timestamps (dates ahead of system clock)
- **3. Coverage Gaps:** ⚠️ INFO — 14 potential gaps identified
- **4. Orphan Check:** ⚠️ FAIL — 2 pages with zero inbound [[wikilinks]] (my parser initially misread a piped wikilink)
- **5. Duplicate Detection:** ✅ PASS — no exact duplicates
- **6. Log Check:** ⚠️ INIT — log.md was missing, created by this lint run. index.md also missing.
