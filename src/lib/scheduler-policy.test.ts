import { describe, expect, it } from "vitest";
import { allPointsWithinResultingCentroid, evaluateSchedulerFeasibility, removeOneCoordinate, scoreSchedulerDay } from "./scheduler-policy";

const day = { date: "2026-07-30", totalPoints: 10, zones: { 1: 1 }, coords: [{ latitude: 3.12, longitude: 101.62 }] };

describe("shared scheduler policy", () => {
  it("keeps the normal hard cap at 20 and isolates no-coordinate zones", () => {
    expect(evaluateSchedulerFeasibility(day, { zone: 1, points: 11, latitude: 3.13, longitude: 101.63 }).reason).toBe("CAPACITY");
    expect(evaluateSchedulerFeasibility(day, { zone: 2, points: 1, latitude: null, longitude: null }).reason).toBe("ZONE_ISOLATION");
    expect(evaluateSchedulerFeasibility(day, { zone: 1, points: 1, latitude: null, longitude: null }).feasible).toBe(true);
  });

  it("enforces all points against the resulting centroid", () => {
    expect(allPointsWithinResultingCentroid([{ latitude: 3.0, longitude: 101.5 }, { latitude: 3.3, longitude: 101.5 }])).toBe(false);
  });

  it("has deterministic scores and removes only one duplicate coordinate", () => {
    expect(scoreSchedulerDay(day, { zone: 1, points: 1, latitude: 3.13, longitude: 101.63 }, 0)).toBeLessThan(scoreSchedulerDay(day, { zone: 2, points: 1, latitude: null, longitude: null }, 1));
    const duplicate = { latitude: 3.1, longitude: 101.6 };
    expect(removeOneCoordinate([duplicate, duplicate], duplicate)).toHaveLength(1);
  });
});
