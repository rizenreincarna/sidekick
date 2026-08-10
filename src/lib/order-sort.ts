/**
 * Orders-tab sorting helpers.
 *
 * Why this exists: order timestamps come from a SQLite DATETIME column that
 * Prisma serializes as an ISO-8601 string ("2026-08-07T06:04:15.000Z"). Many
 * orders share the exact same createdAt second (bulk imports), so a naive
 * `createdAt`-only comparator leaves large tie groups whose order is then
 * decided by Array.sort's behaviour on equal keys — i.e. arbitrary. The visible
 * symptom was "event orders pinned to the top" and "latest created not first":
 * the newest batch (which happened to be EVENT-* orders) led the list and the
 * tie within it was unordered.
 *
 * The comparator below sorts strictly by the requested key and always falls
 * back to a deterministic tie-break so equal-key groups have a stable,
 * predictable order.
 */

/** Minimal shape the comparator needs; the full Order type is a superset. */
export interface OrderSortable {
  id: string;
  orderId: string;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type SortOrder =
  | "created-desc"
  | "created-asc"
  | "id-asc"
  | "id-desc"
  | "updated-desc"
  | "updated-asc";

/**
 * Parse a timestamp coming back from the API into epoch milliseconds.
 *
 * Handles:
 *  - ISO-8601 with T (Prisma's JSON form)   → Date.parse
 *  - SQLite "YYYY-MM-DD HH:MM:SS" (space)   → normalised to ISO then parsed
 *  - bare epoch strings                      → numeric fallback
 * Returns 0 for unparseable input so bad rows sink rather than crash the sort.
 */
export function toTimestamp(value: string | null | undefined): number {
  if (typeof value !== "string" || value.length === 0) return 0;
  // SQLite CURRENT_TIMESTAMP form "YYYY-MM-DD HH:MM:SS" MUST be handled first:
  // V8 parses the space separator as *local* time (not UTC, and not NaN), which
  // would silently shift every bulk-imported order by the TZ offset. Treat it
  // as UTC explicitly.
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(value)) {
    const asUtc = Date.parse(value.replace(" ", "T") + "Z");
    if (!Number.isNaN(asUtc)) return asUtc;
  }
  const parsed = Date.parse(value);
  if (!Number.isNaN(parsed)) return parsed;
  const asInt = parseInt(value, 10);
  return Number.isNaN(asInt) ? 0 : asInt;
}

/** Numeric portion of an orderId (handles Encore 5-digit and EVENT-/ERTHBOX- ids). */
const numOf = (orderId: string) => parseInt(String(orderId).replace(/\D/g, ""), 10) || 0;

/** Comparator factory for the Orders-tab sort dropdown. */
export function compareOrders(sortOrder: SortOrder) {
  return (a: OrderSortable, b: OrderSortable): number => {
    let primary = 0;
    switch (sortOrder) {
      case "created-desc":
        primary = toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
        break;
      case "created-asc":
        primary = toTimestamp(a.createdAt) - toTimestamp(b.createdAt);
        break;
      case "updated-desc":
        primary = toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt);
        break;
      case "updated-asc":
        primary = toTimestamp(a.updatedAt) - toTimestamp(b.updatedAt);
        break;
      case "id-asc": {
        const an = numOf(a.orderId);
        const bn = numOf(b.orderId);
        primary = an !== bn ? an - bn : String(a.orderId).localeCompare(String(b.orderId));
        break;
      }
      case "id-desc": {
        const an = numOf(a.orderId);
        const bn = numOf(b.orderId);
        primary = an !== bn ? bn - an : String(b.orderId).localeCompare(String(a.orderId));
        break;
      }
      default:
        primary = 0;
    }
    // id sorts are already fully deterministic on their own key; only the
    // timestamp sorts need the tie-break to stabilise same-second batches.
    if (primary !== 0 || sortOrder === "id-asc" || sortOrder === "id-desc") return primary;
    // Deterministic tie-break: larger numeric orderId first, then lexicographic
    // orderId, then cuid id — descending so "bigger/newer" sinks to the top.
    const an = numOf(a.orderId);
    const bn = numOf(b.orderId);
    if (an !== bn) return bn - an;
    const byOrderId = String(b.orderId).localeCompare(String(a.orderId));
    if (byOrderId !== 0) return byOrderId;
    return String(b.id).localeCompare(String(a.id));
  };
}
