import { describe, expect, it } from "vitest";
import { estimateDayRouteDistance, routeAdditionIsFeasible } from "./marie-route-planner";

describe("Marie read-only route planner", () => {
  it("accepts a tight route without mutating coordinates", () => {
    const existing = [{ latitude: 3.12, longitude: 101.62 }];
    const snapshot = structuredClone(existing);
    expect(routeAdditionIsFeasible(existing, { latitude: 3.13, longitude: 101.63 })).toBe(true);
    expect(existing).toEqual(snapshot);
    expect(estimateDayRouteDistance(existing)).toBeGreaterThan(0);
  });

  it("rejects a candidate outside route and cluster constraints", () => {
    expect(routeAdditionIsFeasible([{ latitude: 3.12, longitude: 101.62 }], { latitude: 4.2, longitude: 102.4 })).toBe(false);
  });
});
