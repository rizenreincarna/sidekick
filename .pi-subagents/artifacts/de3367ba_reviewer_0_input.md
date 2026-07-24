# Task for reviewer

[Read from: /root/my-app/plan.md, /root/my-app/progress.md]

Perform a rigorous correctness audit of this React/TypeScript turn-by-turn navigation engine (Next.js client hooks). Read these files in full:

- /root/sidekick-dev/src/hooks/use-navigation-engine.ts
- /root/sidekick-dev/src/hooks/use-driver-location.ts
- /root/sidekick-dev/src/hooks/use-speech-navigation.ts
- /root/sidekick-dev/src/hooks/use-wake-lock.ts
- /root/sidekick-dev/src/lib/geo-utils.ts
- /root/sidekick-dev/src/lib/navigation.ts
- /root/sidekick-dev/src/lib/osrm.ts

Hunt specifically for:
1. State machine bugs: transitions that can get stuck (e.g. status 'ready' never reached, completed never firing, arrived → next leg race).
2. React hook issues: stale closures, missing/incorrect effect deps causing loops or missed updates, state updates after unmount, ref/state divergence.
3. Race conditions: concurrent leg requests (AbortController sequencing), reroute while completing, position updates during target switch.
4. Geometry math errors: cumulative distance indexing, projection edge cases (empty/1-point paths, antimeridian not relevant), step-index boundary conditions, bearing calculation.
5. Memory leaks: intervals/rAF/watchers not cleaned up, AbortController leaks.
6. Off-by-one errors in stepStartDistances vs steps arrays, target indexing, resume index handling.
7. Voice cue logic: can announcements double-fire or fire for stale steps?

For each finding: file:line, severity (critical/high/medium/low), concise explanation, and a concrete fix suggestion. Be skeptical and verify claims against the actual code. Do NOT edit files — report only. Return a numbered list ordered by severity.

## Acceptance Contract
Acceptance level: attested
Completion is not accepted from prose alone. End with a structured acceptance report.

Criteria:
- criterion-1: Return concrete findings with file paths and severity when applicable

Required evidence: review-findings, residual-risks

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