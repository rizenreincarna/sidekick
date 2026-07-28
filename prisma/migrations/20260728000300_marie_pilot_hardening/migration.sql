-- Gate 3 hardening and webhook-delivery idempotency. No automation is enabled.
ALTER TABLE "CustomerMessage" ADD COLUMN "sendStartedAt" DATETIME;

CREATE TABLE "MarieWebhookDelivery" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "deliveryKey" TEXT NOT NULL,
  "envelopeId" TEXT,
  "eventType" TEXT NOT NULL,
  "sessionName" TEXT NOT NULL,
  "outcome" TEXT,
  "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" DATETIME
);
CREATE UNIQUE INDEX "MarieWebhookDelivery_deliveryKey_key" ON "MarieWebhookDelivery"("deliveryKey");
CREATE INDEX "MarieWebhookDelivery_eventType_receivedAt_idx" ON "MarieWebhookDelivery"("eventType", "receivedAt");
