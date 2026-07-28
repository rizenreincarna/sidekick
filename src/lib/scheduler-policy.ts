import { FIXED_LOCATIONS } from "./route-model";

export const SCHEDULER_MAX_POINTS = 20;
export const MAX_DAILY_ROUTE_KM = 110;
export const MAX_CLUSTER_RADIUS_KM = 12;
const ROAD_FACTOR = 1.25;

export interface RouteCoordinate { latitude: number; longitude: number }
export interface SchedulerDayState {
  date: string;
  totalPoints: number;
  zones: Record<number, number>;
  coords: RouteCoordinate[];
}
export interface SchedulerCandidate {
  zone: number;
  points: number;
  latitude: number | null;
  longitude: number | null;
}

export function hasCoordinates(value: { latitude: number | null; longitude: number | null }): value is RouteCoordinate {
  return value.latitude !== null && value.longitude !== null;
}

export function haversineDistance(a: RouteCoordinate, b: RouteCoordinate): number {
  const radius = 6371;
  const dLat = (b.latitude - a.latitude) * Math.PI / 180;
  const dLng = (b.longitude - a.longitude) * Math.PI / 180;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * Math.PI / 180) * Math.cos(b.latitude * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function estimateDayRouteDistance(coords: RouteCoordinate[]): number {
  if (coords.length === 0) return 0;
  const remaining = new Set(coords.map((_, index) => index));
  let current: RouteCoordinate = FIXED_LOCATIONS.HOME;
  let total = 0;
  while (remaining.size > 0) {
    let closest = -1;
    let distance = Infinity;
    for (const index of remaining) {
      const candidate = haversineDistance(current, coords[index]);
      if (candidate < distance) { closest = index; distance = candidate; }
    }
    remaining.delete(closest);
    total += distance;
    current = coords[closest];
  }
  total += haversineDistance(current, FIXED_LOCATIONS.DROP_A);
  total += haversineDistance(FIXED_LOCATIONS.DROP_A, FIXED_LOCATIONS.HOME);
  return total * ROAD_FACTOR;
}

export function centroid(points: RouteCoordinate[]): RouteCoordinate | null {
  if (points.length === 0) return null;
  return {
    latitude: points.reduce((sum, point) => sum + point.latitude, 0) / points.length,
    longitude: points.reduce((sum, point) => sum + point.longitude, 0) / points.length,
  };
}

export function allPointsWithinResultingCentroid(points: RouteCoordinate[], maxRadiusKm = MAX_CLUSTER_RADIUS_KM): boolean {
  const center = centroid(points);
  return center === null || points.every(point => haversineDistance(point, center) <= maxRadiusKm);
}

export function evaluateSchedulerFeasibility(
  day: SchedulerDayState,
  candidate: SchedulerCandidate,
  capacityHardCap = SCHEDULER_MAX_POINTS,
): { feasible: boolean; reason: "CAPACITY" | "ZONE_ISOLATION" | "ROUTE" | "CLUSTER" | null } {
  if (day.totalPoints + candidate.points > capacityHardCap) return { feasible: false, reason: "CAPACITY" };
  if (!hasCoordinates(candidate)) {
    const occupiedZones = Object.keys(day.zones).map(Number).filter(zone => day.zones[zone] > 0);
    return occupiedZones.length === 0 || occupiedZones.every(zone => zone === candidate.zone)
      ? { feasible: true, reason: null }
      : { feasible: false, reason: "ZONE_ISOLATION" };
  }
  const resulting = [...day.coords, candidate];
  if (estimateDayRouteDistance(resulting) > MAX_DAILY_ROUTE_KM) return { feasible: false, reason: "ROUTE" };
  if (!allPointsWithinResultingCentroid(resulting)) return { feasible: false, reason: "CLUSTER" };
  return { feasible: true, reason: null };
}

export function scoreSchedulerDay(day: SchedulerDayState, candidate: SchedulerCandidate, dateIndex: number, capacityHardCap = SCHEDULER_MAX_POINTS): number {
  const sameZone = (day.zones[candidate.zone] || 0) > 0;
  const zonePenalty = sameZone ? 0 : 10;
  const densityBonus = -(day.totalPoints / capacityHardCap) * 2;
  const emptyPenalty = day.totalPoints === 0 ? 5 : 0;
  const dateBonus = dateIndex * 0.05;
  const geoCost = hasCoordinates(candidate)
    ? (estimateDayRouteDistance([...day.coords, candidate]) / MAX_DAILY_ROUTE_KM) * 25
    : sameZone ? 3 : 25;
  return geoCost + zonePenalty + densityBonus + emptyPenalty + dateBonus;
}

export function removeOneCoordinate(coords: RouteCoordinate[], target: RouteCoordinate): RouteCoordinate[] {
  const index = coords.findIndex(coord => coord.latitude === target.latitude && coord.longitude === target.longitude);
  return index < 0 ? coords.slice() : [...coords.slice(0, index), ...coords.slice(index + 1)];
}
