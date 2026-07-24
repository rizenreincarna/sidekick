# Task for reviewer

[Read from: /root/my-app/plan.md, /root/my-app/progress.md]

Perform a rigorous security + React correctness audit of these Next.js app router files:

- /root/sidekick-dev/src/app/api/navigation/route/route.ts (OSRM proxy)
- /root/sidekick-dev/src/app/api/route/navigation/route.ts (route retrieval)
- /root/sidekick-dev/src/app/route/navigate/page.tsx
- /root/sidekick-dev/src/components/navigation-client.tsx
- /root/sidekick-dev/src/components/navigation-map-maplibre.tsx
- /root/sidekick-dev/src/components/navigation-maneuver-card.tsx
- /root/sidekick-dev/src/components/navigation-bottom-panel.tsx
- /root/sidekick-dev/src/components/navigation-exit-dialog.tsx

Also read /root/sidekick-dev/src/lib/session.ts and /root/sidekick-dev/src/components/route-planner-client.tsx for context (the diff there wires Start Route to /route/navigate).

Hunt specifically for:
1. AuthZ/AuthN gaps: unauthenticated or cross-user access (userId param handling — compare with how /api/route/preview handles it), privilege escalation.
2. Privacy: can customer PII leak to OSRM or the browser beyond necessity? localStorage sensitive data?
3. Input validation: lat/lng ranges, date format, JSON body size, cache key collisions, cache memory exhaustion.
4. SSR/CSR issues: window/document access during SSR, maplibre-gl imported server-side, hydration mismatches.
5. React issues: stale closures, effect dep problems, missing cleanup (map instance, markers, rAF), error states that can't be recovered, state updates after unmount.
6. XSS/injection: dangerouslySetInnerHTML, innerHTML usage with user data (stop titles in marker DOM?), tel: and other URL schemes.
7. MapLibre v6 API misuse (e.g. addLayer before style loaded, source updates on missing style).
8. Accessibility gaps in the new UI.

For each finding: file:line, severity (critical/high/medium/low), concise explanation, concrete fix suggestion. Verify claims against actual code. Do NOT edit files — report only. Return a numbered list ordered by severity.

## Acceptance Contract
Acceptance level: reviewed
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Implement the requested change without widening scope
- criterion-2: Return evidence sufficient for an independent acceptance review

Required evidence: changed-files, tests-added, commands-run, validation-output, residual-risks, no-staged-files

Review gate: required by reviewer.

Finish with a fenced JSON block tagged `acceptance-report` in this shape:
Use empty arrays when no items apply; array fields contain strings unless object entries are shown.
```acceptance-report
{
  "criteriaSatisfied": [
    {
      "id": "criterion-1",
      "status": "satisfied",
      "evidence": "specific proof"
    }
  ],
  "changedFiles": [
    "src/file.ts"
  ],
  "testsAddedOrUpdated": [
    "test/file.test.ts"
  ],
  "commandsRun": [
    {
      "command": "command",
      "result": "passed",
      "summary": "short result"
    }
  ],
  "validationOutput": [
    "validation output or concise summary"
  ],
  "residualRisks": [
    "none"
  ],
  "noStagedFiles": true,
  "diffSummary": "short description of the diff",
  "reviewFindings": [
    "blocker: file.ts:12 - issue found, or no blockers"
  ],
  "manualNotes": "anything else the parent should know"
}
```