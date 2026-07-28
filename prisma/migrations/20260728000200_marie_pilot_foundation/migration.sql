-- Additive Gate 3 PILOT foundation. Configuration remains disabled/DRY_RUN.
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;

ALTER TABLE "MarieAutomationConfig" ADD COLUMN "escalationEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CustomerConversation" ADD COLUMN "lid" TEXT;
ALTER TABLE "AutomationJob" ADD COLUMN "leaseToken" TEXT;
ALTER TABLE "AutomationJob" ADD COLUMN "deadLetteredAt" DATETIME;

-- SQLite requires a table rebuild to make normalizedPhone nullable.
CREATE TABLE "new_CustomerConversation" (
  "id" TEXT NOT NULL PRIMARY KEY, "orderId" TEXT, "chatId" TEXT NOT NULL,
  "normalizedPhone" TEXT, "lid" TEXT, "state" TEXT NOT NULL DEFAULT 'ACTIVE', "language" TEXT,
  "pausedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CustomerConversation" ("id","orderId","chatId","normalizedPhone","state","language","pausedAt","createdAt","updatedAt")
SELECT "id","orderId","chatId","normalizedPhone","state","language","pausedAt","createdAt","updatedAt" FROM "CustomerConversation";
DROP TABLE "CustomerConversation";
ALTER TABLE "new_CustomerConversation" RENAME TO "CustomerConversation";
CREATE UNIQUE INDEX "CustomerConversation_orderId_chatId_key" ON "CustomerConversation"("orderId", "chatId");
CREATE INDEX "CustomerConversation_state_updatedAt_idx" ON "CustomerConversation"("state", "updatedAt");
CREATE INDEX "CustomerConversation_normalizedPhone_idx" ON "CustomerConversation"("normalizedPhone");
CREATE INDEX "CustomerConversation_chatId_idx" ON "CustomerConversation"("chatId");
CREATE INDEX "CustomerConversation_lid_idx" ON "CustomerConversation"("lid");

CREATE TABLE "MarieUnmatchedWebhook" (
  "id" TEXT NOT NULL PRIMARY KEY, "providerMessageId" TEXT,
  "eventType" TEXT NOT NULL, "reasonCode" TEXT NOT NULL, "identifierKind" TEXT NOT NULL,
  "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "MarieUnmatchedWebhook_providerMessageId_key" ON "MarieUnmatchedWebhook"("providerMessageId");
CREATE INDEX "MarieUnmatchedWebhook_reasonCode_receivedAt_idx" ON "MarieUnmatchedWebhook"("reasonCode", "receivedAt");

COMMIT;
PRAGMA foreign_keys=ON;
