-- Align Marie table definitions with Prisma's SQLite @updatedAt representation.
PRAGMA foreign_keys=OFF;
BEGIN IMMEDIATE;

CREATE TABLE "new_AutomationJob" (
  "id" TEXT NOT NULL PRIMARY KEY, "orderId" TEXT, "conversationId" TEXT, "kind" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING', "idempotencyKey" TEXT NOT NULL, "runAfter" DATETIME NOT NULL,
  "leaseUntil" DATETIME, "leaseToken" TEXT, "attempts" INTEGER NOT NULL DEFAULT 0, "deadLetteredAt" DATETIME,
  "lastErrorCode" TEXT, "payload" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "AutomationJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "AutomationJob_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CustomerConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AutomationJob" SELECT "id","orderId","conversationId","kind","state","idempotencyKey","runAfter","leaseUntil","leaseToken","attempts","deadLetteredAt","lastErrorCode","payload","createdAt","updatedAt" FROM "AutomationJob";
DROP TABLE "AutomationJob"; ALTER TABLE "new_AutomationJob" RENAME TO "AutomationJob";
CREATE UNIQUE INDEX "AutomationJob_idempotencyKey_key" ON "AutomationJob"("idempotencyKey");
CREATE INDEX "AutomationJob_state_runAfter_idx" ON "AutomationJob"("state", "runAfter");
CREATE INDEX "AutomationJob_orderId_state_idx" ON "AutomationJob"("orderId", "state");

CREATE TABLE "new_CustomerConversation" (
  "id" TEXT NOT NULL PRIMARY KEY, "orderId" TEXT, "chatId" TEXT NOT NULL, "normalizedPhone" TEXT, "lid" TEXT,
  "state" TEXT NOT NULL DEFAULT 'ACTIVE', "language" TEXT, "pausedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CustomerConversation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CustomerConversation" SELECT "id","orderId","chatId","normalizedPhone","lid","state","language","pausedAt","createdAt","updatedAt" FROM "CustomerConversation";
DROP TABLE "CustomerConversation"; ALTER TABLE "new_CustomerConversation" RENAME TO "CustomerConversation";
CREATE UNIQUE INDEX "CustomerConversation_orderId_chatId_key" ON "CustomerConversation"("orderId", "chatId");
CREATE INDEX "CustomerConversation_state_updatedAt_idx" ON "CustomerConversation"("state", "updatedAt");
CREATE INDEX "CustomerConversation_normalizedPhone_idx" ON "CustomerConversation"("normalizedPhone");
CREATE INDEX "CustomerConversation_chatId_idx" ON "CustomerConversation"("chatId");
CREATE INDEX "CustomerConversation_lid_idx" ON "CustomerConversation"("lid");

CREATE TABLE "new_CustomerMessage" (
  "id" TEXT NOT NULL PRIMARY KEY, "conversationId" TEXT NOT NULL, "direction" TEXT NOT NULL, "providerMessageId" TEXT,
  "idempotencyKey" TEXT NOT NULL, "body" TEXT, "bodyHash" TEXT, "messageType" TEXT NOT NULL DEFAULT 'TEXT',
  "deliveryState" TEXT NOT NULL DEFAULT 'PENDING', "retryCount" INTEGER NOT NULL DEFAULT 0, "providerTimestamp" DATETIME,
  "metadata" TEXT, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL, "sendStartedAt" DATETIME,
  CONSTRAINT "CustomerMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CustomerConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CustomerMessage" SELECT "id","conversationId","direction","providerMessageId","idempotencyKey","body","bodyHash","messageType","deliveryState","retryCount","providerTimestamp","metadata","createdAt","updatedAt","sendStartedAt" FROM "CustomerMessage";
DROP TABLE "CustomerMessage"; ALTER TABLE "new_CustomerMessage" RENAME TO "CustomerMessage";
CREATE UNIQUE INDEX "CustomerMessage_providerMessageId_key" ON "CustomerMessage"("providerMessageId");
CREATE UNIQUE INDEX "CustomerMessage_idempotencyKey_key" ON "CustomerMessage"("idempotencyKey");
CREATE INDEX "CustomerMessage_conversationId_createdAt_idx" ON "CustomerMessage"("conversationId", "createdAt");
CREATE INDEX "CustomerMessage_direction_deliveryState_idx" ON "CustomerMessage"("direction", "deliveryState");

CREATE TABLE "new_CustomerEscalation" (
  "id" TEXT NOT NULL PRIMARY KEY, "orderId" TEXT, "conversationId" TEXT, "correlationId" TEXT NOT NULL,
  "category" TEXT NOT NULL, "severity" TEXT NOT NULL, "state" TEXT NOT NULL DEFAULT 'OPEN', "summary" TEXT NOT NULL,
  "proposedAction" TEXT, "resolvedBy" TEXT, "resolvedAt" DATETIME, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CustomerEscalation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "CustomerEscalation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CustomerConversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_CustomerEscalation" SELECT "id","orderId","conversationId","correlationId","category","severity","state","summary","proposedAction","resolvedBy","resolvedAt","createdAt","updatedAt" FROM "CustomerEscalation";
DROP TABLE "CustomerEscalation"; ALTER TABLE "new_CustomerEscalation" RENAME TO "CustomerEscalation";
CREATE UNIQUE INDEX "CustomerEscalation_correlationId_key" ON "CustomerEscalation"("correlationId");
CREATE INDEX "CustomerEscalation_state_severity_createdAt_idx" ON "CustomerEscalation"("state", "severity", "createdAt");
CREATE INDEX "CustomerEscalation_orderId_state_idx" ON "CustomerEscalation"("orderId", "state");

CREATE TABLE "new_OrderHold" (
  "id" TEXT NOT NULL PRIMARY KEY, "orderId" TEXT, "reasonCode" TEXT NOT NULL, "reason" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'ACTIVE', "createdBy" TEXT NOT NULL, "releasedBy" TEXT, "releasedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "OrderHold_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_OrderHold" SELECT "id","orderId","reasonCode","reason","state","createdBy","releasedBy","releasedAt","createdAt","updatedAt" FROM "OrderHold";
DROP TABLE "OrderHold"; ALTER TABLE "new_OrderHold" RENAME TO "OrderHold";
CREATE INDEX "OrderHold_orderId_state_idx" ON "OrderHold"("orderId", "state");
CREATE INDEX "OrderHold_state_createdAt_idx" ON "OrderHold"("state", "createdAt");

CREATE TABLE "new_MarieAutomationConfig" (
  "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default', "enabled" BOOLEAN NOT NULL DEFAULT false, "mode" TEXT NOT NULL DEFAULT 'DRY_RUN',
  "contactStartHour" INTEGER NOT NULL DEFAULT 8, "contactEndHour" INTEGER NOT NULL DEFAULT 20,
  "normalCapacity" INTEGER NOT NULL DEFAULT 20, "maxCapacity" INTEGER NOT NULL DEFAULT 25, "pilotAllowlist" TEXT NOT NULL DEFAULT '[]',
  "maxMessagesPerRun" INTEGER NOT NULL DEFAULT 10, "maxMessagesPerHour" INTEGER NOT NULL DEFAULT 20, "maxMessagesPerDay" INTEGER NOT NULL DEFAULT 100,
  "maxRetries" INTEGER NOT NULL DEFAULT 3, "wahaSessionName" TEXT, "telegramOwnerId" TEXT, "escalationEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_MarieAutomationConfig" SELECT "id","enabled","mode","contactStartHour","contactEndHour","normalCapacity","maxCapacity","pilotAllowlist","maxMessagesPerRun","maxMessagesPerHour","maxMessagesPerDay","maxRetries","wahaSessionName","telegramOwnerId","escalationEnabled","createdAt","updatedAt" FROM "MarieAutomationConfig";
DROP TABLE "MarieAutomationConfig"; ALTER TABLE "new_MarieAutomationConfig" RENAME TO "MarieAutomationConfig";

COMMIT;
PRAGMA foreign_keys=ON;
