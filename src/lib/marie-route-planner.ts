export {
  MAX_CLUSTER_RADIUS_KM,
  MAX_DAILY_ROUTE_KM,
  centroid,
  estimateDayRouteDistance,
  haversineDistance,
  type RouteCoordinate,
} from "./scheduler-policy";

import { evaluateSchedulerFeasibility, type RouteCoordinate } from "./scheduler-policy";

export function routeAdditionIsFeasible(existing: RouteCoordinate[], candidate: RouteCoordinate): boolean {
  return evaluateSchedulerFeasibility({ date: "", totalPoints: 0, zones: {}, coords: existing }, { ...candidate, zone: 0, points: 0 }, Number.MAX_SAFE_INTEGER).feasible;
}
