import { describe, it, expect } from "vitest";

interface TargetLike {
  id: string;
  completed?: boolean;
}

export function resumeIndexForUpcoming(
  targets: TargetLike[],
  completedIds: Set<string>,
  skippedIds: Set<string>,
  absoluteIndex: number
): number {
  const completedBefore = targets
    .slice(0, absoluteIndex)
    .filter((t) => t.completed || completedIds.has(t.id) || skippedIds.has(t.id)).length;
  return Math.max(0, absoluteIndex - completedBefore);
}

export function finalRouteStatus(
  completedBySkipping: boolean,
  unresolvedRemaining: number
): "COMPLETED" | "NEEDS_ATTENTION" {
  if (completedBySkipping || unresolvedRemaining > 0) return "NEEDS_ATTENTION";
  return "COMPLETED";
}

const T = (id: string, completed = false): TargetLike => ({ id, completed });

describe("navigation resume index", () => {
  it("does not skip extra stops when some targets are already complete", () => {
    const targets = [T("a", true), T("b", true), T("c"), T("d")];
    expect(resumeIndexForUpcoming(targets, new Set(), new Set(), 2)).toBe(0);
  });

  it("accounts for locally completed targets", () => {
    const targets = [T("a"), T("b"), T("c")];
    expect(resumeIndexForUpcoming(targets, new Set(["a"]), new Set(), 2)).toBe(1);
  });

  it("never goes below zero", () => {
    expect(resumeIndexForUpcoming([T("a", true), T("b")], new Set(), new Set(), 1)).toBe(0);
  });
});

describe("route final status", () => {
  it("skip-all does not complete the route", () => {
    expect(finalRouteStatus(true, 0)).toBe("NEEDS_ATTENTION");
  });
  it("unresolved stops do not complete the route", () => {
    expect(finalRouteStatus(false, 2)).toBe("NEEDS_ATTENTION");
  });
  it("all stops genuinely completed completes the route", () => {
    expect(finalRouteStatus(false, 0)).toBe("COMPLETED");
  });
});
