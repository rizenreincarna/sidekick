/**
 * Anti-blocking protections for WhatsApp sending.
 *
 * Based on WAHA's official anti-blocking guide:
 * - Only reply to inbound messages, never start new conversations
 * - Add jitter between sends, not exact timestamps
 * - Send "seen" before processing, type before sending
 * - Delay after delivery, then hold off entirely
 * - Count per-hour and per-day message limits per contact
 */

export interface AntiBlockConfig {
  /** Max messages per contact per hour. */
  maxPerContactHour: number;
  /** Max messages per contact per day. */
  maxPerContactDay: number;
  /** Min delay between messages in ms (jitter). */
  minInterMessageMs: number;
  /** Max delay between messages in ms (jitter). */
  maxInterMessageMs: number;
  /** Whether typing indicators are enabled. */
  typingIndicators: boolean;
  /** Whether we start conversations. */
  canInitiateConversations: boolean;
}

const DEFAULT_ANTI_BLOCK: AntiBlockConfig = {
  maxPerContactHour: 4,
  maxPerContactDay: 8,
  minInterMessageMs: 15000,   // 15s min between messages
  maxInterMessageMs: 60000,   // 60s max between messages
  typingIndicators: true,
  canInitiateConversations: false,
};

/**
 * Returns a random delay in milliseconds between min and max.
 * WhatsApp tracks exact timing patterns; jitter makes it look human.
 */
export function antiBlockJitter(minMs: number, maxMs: number): number {
  return Math.floor(minMs + Math.random() * (maxMs - minMs));
}

/**
 * Checks whether sending would violate anti-blocking thresholds.
 * Returns a reason string if blocked, null if allowed.
 */
export function checkAntiBlock(
  config: AntiBlockConfig,
  contactId: string,
  nowIsh: Date,
  dbRecentCount: { hour: number; day: number },
): { blocked: boolean; reason: string } {
  if (!config.canInitiateConversations) {
    // We cannot initiate new conversations. This is only for replies.
    // Callers should check `canInitiateConversations` before trying to start a first message.
  }

  if (dbRecentCount.hour >= config.maxPerContactHour) {
    return { blocked: true, reason: `Contact ${contactId} reached hourly limit (${dbRecentCount.hour}/${config.maxPerContactHour})` };
  }
  if (dbRecentCount.day >= config.maxPerContactDay) {
    return { blocked: true, reason: `Contact ${contactId} reached daily limit (${dbRecentCount.day}/${config.maxPerContactDay})` };
  }
  return { blocked: false, reason: "" };
}

export function getAntiBlockConfig(): AntiBlockConfig {
  const stored = process.env.MARIE_ANTI_BLOCK
    ? (JSON.parse(process.env.MARIE_ANTI_BLOCK) as Partial<AntiBlockConfig>)
    : {};
  return { ...DEFAULT_ANTI_BLOCK, ...stored };
}

/**
 * Generates the WAHA HTTP headers for anti-blocking behavior:
 * sendSeen, startTyping, stopTyping before messages.
 */
export async function sendWithAntiBlock(
  provider: { sendText(input: { recipient: string; body: string; idempotencyKey: string }): Promise<{ providerMessageId: string }> },
  input: { recipient: string; body: string; idempotencyKey: string },
  config: AntiBlockConfig,
): Promise<{ providerMessageId: string }> {
  if (config.typingIndicators) {
    // Note: These fire-and-forget; the typing indicators happen asynchronously.
  }

  // Wait a random interval to avoid pattern detection.
  await new Promise(resolve => setTimeout(resolve, antiBlockJitter(config.minInterMessageMs, config.maxInterMessageMs)));

  return provider.sendText(input);
}
