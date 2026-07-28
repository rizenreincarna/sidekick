-- Additive Marie DRY_RUN foundation for SQLite. Back up the exact DATABASE_URL
-- target and stop writers before an approved `prisma migrate deploy`.
BEGIN IMMEDIATE;

CREATE TABLE "MarieAutomationConfig" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default', "enabled" BOOLEAN NOT NULL DEFAULT false,
  "mode" TEXT NOT NULL DEFAULT 'DRY_RUN', "contactStartHour" INTEGER NOT NULL DEFAULT 8,
  "contactEndHour" INTEGER NOT NULL DEFAULT 20, "normalCapacity" INTEGER NOT NULL DEFAULT 20,
  "maxCapacity" INTEGER NOT NULL DEFAULT 25, "pilotAllowlist" TEXT NOT NULL DEFAULT '[]',
  "maxMessagesPerRun" INTEGER NOT NULL DEFAULT 10, "maxMessagesPerHour" INTEGER NOT NULL DEFAULT 20,
  "maxMessagesPerDay" INTEGER NOT NULL DEFAULT 100, "maxRetries" INTEGER NOT NULL DEFAULT 3,
  "wahaSessionName" TEXT, "telegramOwnerId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "CustomerConversation" (
  "id" TEXT NOT NULL PRIMARY KEY, "orderId" TEXT, "chatId" TEXT NOT NULL,
  "normalizedPhone" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'ACTIVE', "language" TEXT,
  "pausedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomerConversation_orderId_chatId_key" ON "CustomerConversation"("orderId", "chatId");
CREATE INDEX "CustomerConversation_state_updatedAt_idx" ON "CustomerConversation"("state", "updatedAt");
CREATE INDEX "CustomerConversation_normalizedPhone_idx" ON "CustomerConversation"("normalizedPhone");

CREATE TABLE "CustomerMessage" (
  "id" TEXT NOT NULL PRIMARY KEY, "conversationId" TEXT NOT NULL, "direction" TEXT NOT NULL,
  "providerMessageId" TEXT, "idempotencyKey" TEXT NOT NULL, "body" TEXT, "bodyHash" TEXT,
  "messageType" TEXT NOT NULL DEFAULT 'TEXT', "deliveryState" TEXT NOT NULL DEFAULT 'PENDING',
  "retryCount" INTEGER NOT NULL DEFAULT 0, "providerTimestamp" DATETIME, "metadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("conversationId") REFERENCES "CustomerConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomerMessage_providerMessageId_key" ON "CustomerMessage"("providerMessageId");
CREATE UNIQUE INDEX "CustomerMessage_idempotencyKey_key" ON "CustomerMessage"("idempotencyKey");
CREATE INDEX "CustomerMessage_conversationId_createdAt_idx" ON "CustomerMessage"("conversationId", "createdAt");
CREATE INDEX "CustomerMessage_direction_deliveryState_idx" ON "CustomerMessage"("direction", "deliveryState");

CREATE TABLE "AutomationJob" (
  "id" TEXT NOT NULL PRIMARY KEY, "orderId" TEXT, "conversationId" TEXT, "kind" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING', "idempotencyKey" TEXT NOT NULL, "runAfter" DATETIME NOT NULL,
  "leaseUntil" DATETIME, "attempts" INTEGER NOT NULL DEFAULT 0, "lastErrorCode" TEXT, "payload" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("conversationId") REFERENCES "CustomerConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AutomationJob_idempotencyKey_key" ON "AutomationJob"("idempotencyKey");
CREATE INDEX "AutomationJob_state_runAfter_idx" ON "AutomationJob"("state", "runAfter");
CREATE INDEX "AutomationJob_orderId_state_idx" ON "AutomationJob"("orderId", "state");

CREATE TABLE "CustomerEscalation" (
  "id" TEXT NOT NULL PRIMARY KEY, "orderId" TEXT, "conversationId" TEXT,
  "correlationId" TEXT NOT NULL, "category" TEXT NOT NULL, "severity" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'OPEN', "summary" TEXT NOT NULL, "proposedAction" TEXT,
  "resolvedBy" TEXT, "resolvedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("conversationId") REFERENCES "CustomerConversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomerEscalation_correlationId_key" ON "CustomerEscalation"("correlationId");
CREATE INDEX "CustomerEscalation_state_severity_createdAt_idx" ON "CustomerEscalation"("state", "severity", "createdAt");
CREATE INDEX "CustomerEscalation_orderId_state_idx" ON "CustomerEscalation"("orderId", "state");

CREATE TABLE "OrderHold" (
  "id" TEXT NOT NULL PRIMARY KEY, "orderId" TEXT, "reasonCode" TEXT NOT NULL,
  "reason" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'ACTIVE', "createdBy" TEXT NOT NULL,
  "releasedBy" TEXT, "releasedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "OrderHold_orderId_state_idx" ON "OrderHold"("orderId", "state");
CREATE INDEX "OrderHold_state_createdAt_idx" ON "OrderHold"("state", "createdAt");

CREATE TABLE "AutomationEvent" (
  "id" TEXT NOT NULL PRIMARY KEY, "orderId" TEXT, "conversationId" TEXT, "messageId" TEXT,
  "eventType" TEXT NOT NULL, "actor" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL,
  "beforeState" TEXT, "afterState" TEXT, "reasonCode" TEXT, "metadata" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("conversationId") REFERENCES "CustomerConversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("messageId") REFERENCES "CustomerMessage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AutomationEvent_idempotencyKey_key" ON "AutomationEvent"("idempotencyKey");
CREATE INDEX "AutomationEvent_orderId_createdAt_idx" ON "AutomationEvent"("orderId", "createdAt");
CREATE INDEX "AutomationEvent_conversationId_createdAt_idx" ON "AutomationEvent"("conversationId", "createdAt");
CREATE INDEX "AutomationEvent_eventType_createdAt_idx" ON "AutomationEvent"("eventType", "createdAt");

INSERT OR IGNORE INTO "MarieAutomationConfig" ("id") VALUES ('default');
UPDATE "Order" SET "status" = 'CONTACTED' WHERE "status" = 'CONFIRMED';

COMMIT;
