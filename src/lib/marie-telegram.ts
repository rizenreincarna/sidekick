export interface TelegramConfig { enabled: boolean; mode: "DRY_RUN" | "PILOT" | "LIVE"; escalationEnabled: boolean }

export function isPrivateTelegramOwnerId(value: string | undefined): value is string {
  return Boolean(value && /^\d{5,20}$/.test(value));
}

export class TelegramEscalationAdapter {
  constructor(private readonly token: string, private readonly ownerId: string) {
    if (!isPrivateTelegramOwnerId(ownerId)) throw new Error("Invalid private Telegram owner ID");
  }

  async send(input: { correlationId: string; category: string; summary: string }) {
    const text = [`Marie escalation ${input.correlationId}`, `Category: ${input.category}`, input.summary.slice(0, 300)].join("\n");
    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: this.ownerId, text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`TELEGRAM_HTTP_${response.status}`);
  }
}

export async function sendTelegramEscalation(input: { correlationId: string; category: string; summary: string }, config: TelegramConfig, adapter?: TelegramEscalationAdapter) {
  if (!config.enabled || config.mode !== "PILOT" || !config.escalationEnabled) return { sent: false, reason: "GATED" };
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const ownerId = process.env.MARIE_TELEGRAM_OWNER_ID;
  if (!token || !isPrivateTelegramOwnerId(ownerId)) return { sent: false, reason: "MISSING_OR_INVALID_ENV" };
  await (adapter ?? new TelegramEscalationAdapter(token, ownerId)).send(input);
  return { sent: true };
}
