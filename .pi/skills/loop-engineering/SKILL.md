---
name: loop-engineering
description: Structured quality loop for development — Plan → Implement → Verify → Reflect → Loop. Gate-checks each phase. Automatically invoked when a task is multi-step (3+ distinct actions), spans multiple files, involves type/migration/API changes, or the user asks for a feature/refactor. Skip for single-line edits, lookups, documentation-only changes, or trivial syntax fixes. Full pre-flight gate in the skill body.
license: MIT
---

# Loop Engineering

Most coding agents execute in a linear fire-and-forget pattern: read →
edit → hope. When the task is non-trivial, this produces regressions,
half-baked features, and "it works on my machine" surprises. This skill
replaces that with a quality loop that catches problems before the user
does.

## The loop

```
Plan → Implement → Verify → Reflect ──→ Loop (if needed)
  ↑                                      │
  └──────────────────────────────────────┘
```

Each phase has hard gates. You do not proceed past a gate until the
condition is met.

## Pre-flight (run before every task)

This skill adds overhead. About 2-5 extra turns per task. Do not pay
that cost when a direct answer is better.

**Step 1. Explicit invocation check.**

If the user typed `/loop-engineering`, "loop mode", "run the loop", or
explicitly asked for this skill, **SKIP the rest of this section and go
straight to Phase 0**. The user opted in.

**Step 2. Self-judge (only if Step 1 did not match).**

Ask yourself these questions. If fewer than 2 are yes, ABORT.

1. **Multi-step?** Will this task require 3 or more distinct actions
   (read files, edit code, run commands, deploy)?
2. **Multi-file?** Does this touch more than one file, or involve schema
   migrations, API changes, or type changes that cascade?
3. **High-stakes?** Is the cost of getting it wrong high? Does it touch
   production data, auth, payments, or core business logic?
4. **User explicitly asked for a feature or refactor?** Not a question
   or a lookup — they asked you to build something.

If the check passes, proceed to Phase 0. If it fails, ABORT and handle
the task directly. Optionally append: *"For complex work, run
`/loop-engineering` to enable structured quality gates."*

## Phase 0 — Plan

Before touching any code, produce a plan in a todo list.

**Gate: plan is visible and has ≤7 items.**

1. Break the task into discrete steps. Each step should be one
   cohesive action: "Add the helper function", "Update the API route",
   "Add the UI component".
2. For each step, note which files are affected and what the risk is.
3. Create the todo list via the `todo` tool. Mark dependencies.
4. If anything is ambiguous, use `ask_user_question` NOW. Do not
   implement around assumptions.

**Plan must answer:**
- What exactly is being built/changed?
- Which files are touched?
- What could break?
- How will you know it works?

## Phase 1 — Implement

Execute the plan one step at a time. One step = one turn. Do not batch
completions. Do not skip ahead.

**Gate: every step is marked completed in the todo list.**

Rules during implementation:
- **Read before you write.** Always read the file(s) you're about to edit
  to confirm the current state. Code drifts between turns.
- **One edit call per file per turn.** Group changes to the same file
  into one `edit` call with multiple entries in `edits[]`. Do not stack
  multiple edit calls on the same file.
- **Never touch production infrastructure** (PM2, databases, deploys)
  until Phase 2 Verify passes.
- If a step involves a migration or schema change, run it but do not
  assume it succeeded — verify in Phase 2.
- If you hit an unexpected error, STOP. Do not power through. Return to
  Phase 0 and adjust the plan.

## Phase 2 — Verify

After all implementation steps are done, run the verification sequence.
**This phase is mandatory.** Do not skip it.

**Gate: typecheck passes, build succeeds, no regressions detected.**

1. **Typecheck.** Run `npm run typecheck` (or the project's equivalent).
   Must exit 0. If there are errors, fix them and re-verify. Do not
   proceed with type errors.
2. **Build.** Run `npm run build` (or equivalent). Must exit 0. A
   successful typecheck does not guarantee a successful build.
3. **Lint** (optional but recommended). Run `npm run lint` if available.
   Warnings are acceptable. Errors are not.
4. **Schema check.** If you changed the Prisma schema, run
   `npx prisma generate` and verify the client compiles.
5. **Diff review.** Review the git diff (`git diff`). Look for:
   - Leftover debug code, console.log, commented-out blocks
   - Missing error handling
   - Type assertions (`as`, `!`) that could hide nulls
   - Duplicate or dead code

If any gate fails, loop back to Phase 1 and fix. If the fix requires a
plan change, loop back to Phase 0.

## Phase 3 — Reflect

After verification passes, consolidate.

**Gate: learnings are saved, changelog is updated if user-facing.**

1. **Memory.** Use `memory_remember` to save:
   - What was built and why
   - Key decisions made and their rationale
   - Any gotchas encountered
   - File locations for future reference
2. **Changelog.** If the change is user-facing (feature, fix, UI change),
   update `CHANGELOG.md` AND the in-app changelog (check `src/app/page.tsx`
   for a `CHANGELOG` array). Bump the version badge if appropriate.
3. **Deploy.** Only now, after all gates pass, restart the relevant PM2
   service. Verify with a curl or smoke test.
4. **Report.** Give the user a 3-5 line summary: what changed, which files,
   and how to verify.

## Anti-patterns

- **Skipping Verify.** "It's a small change, it'll be fine." — The most
  common failure mode. Always run the typecheck and build.
- **Implementing before Planning.** Jumping into edits without a plan
  produces scattershot changes that miss edge cases.
- **Not reading files before editing.** The file on disk may differ from
  what you read 3 turns ago. Always read fresh.
- **Batching todo completions.** Mark steps complete IMMEDIATELY after
  finishing them, not all at once at the end. This keeps the plan
  accurate and the user informed.
- **Deploying before Verifying.** Never restart PM2 or push a migration
  until Phase 2 passes. A build failure after deploy means downtime.

## Calibration

- **How strict?** For production /root/my-app tasks, follow every gate.
  For dev/experimental work, Phase 2 Verify can be relaxed to typecheck
  only. For throwaway scripts, this skill should not have triggered.
- **How many loops?** If you hit the same gate 3 times in a row, STOP.
  Report the blocker to the user. Do not loop indefinitely.
- **When to skip the changelog?** Internal refactors, dependency bumps
  with no user impact, and dev-only changes do not need changelog entries.
