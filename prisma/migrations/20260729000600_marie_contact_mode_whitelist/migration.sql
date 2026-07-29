-- Contact mode gate for Marie: ALL / WHITELIST / STOPPED.
-- WHITELIST mode additionally gates sends, scheduling, and the no-reply sweep
-- by order number. Default is "WHITELIST" so a fresh deployment starts safe.
ALTER TABLE "MarieAutomationConfig" ADD COLUMN "contactMode" TEXT NOT NULL DEFAULT 'WHITELIST';
-- JSON array of order reference numbers (the customer-facing orderId field).
ALTER TABLE "MarieAutomationConfig" ADD COLUMN "orderAllowlist" TEXT NOT NULL DEFAULT '[]';
