CREATE TABLE IF NOT EXISTS PickupTime(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  orderId TEXT,
  scheduledDate TEXT,
  is_visited BOOLEAN DEFAULT 0
);
INSERT INTO PickupTime (orderId, scheduledDate)
SELECT orderId, scheduledDate
FROM Order
WHERE status = 'PENDING' AND scheduledDate = '2026-06-30';
"