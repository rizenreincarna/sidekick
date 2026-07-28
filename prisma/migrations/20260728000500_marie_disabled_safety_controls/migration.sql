-- Independent inbound kill switch and atomic outbound rate reservations.
ALTER TABLE "MarieAutomationConfig" ADD COLUMN "inboundProcessingEnabled" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AutomationRateReservation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "hourBucket" TEXT NOT NULL,
  "dayBucket" TEXT NOT NULL,
  "reservedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationRateReservation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AutomationRateReservation_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "CustomerConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AutomationRateReservation_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "CustomerMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AutomationRateReservation_messageId_key" ON "AutomationRateReservation"("messageId");
CREATE INDEX "AutomationRateReservation_userId_hourBucket_idx" ON "AutomationRateReservation"("userId", "hourBucket");
CREATE INDEX "AutomationRateReservation_userId_dayBucket_idx" ON "AutomationRateReservation"("userId", "dayBucket");
CREATE INDEX "AutomationRateReservation_conversationId_hourBucket_idx" ON "AutomationRateReservation"("conversationId", "hourBucket");
