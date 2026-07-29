-- Hard cap on sends per worker tick (anti-ban pacing). Runs alongside maxMessagesPerRun —
-- the scheduler claims more jobs for queuing, but the runner respects this lower ceiling
-- unless the operator deliberately raises it. Default 3; individual phones are rate-limited
-- separately by maxMessagesPerHour / maxMessagesPerDay.
ALTER TABLE "MarieAutomationConfig" ADD COLUMN "maxMessagesPerTick" INTEGER NOT NULL DEFAULT 3;
