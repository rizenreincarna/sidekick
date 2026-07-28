import { db } from "./db";
import { isPrivateTelegramOwnerId } from "./marie-telegram";

export async function getMarieReadiness() {
  const config = await db.marieAutomationConfig.findUnique({ where: { id: "default" } });
  const checks = {
    safelyDisabled: config?.enabled === false && config.mode === "DRY_RUN",
    inboundProcessingDisabled: config?.inboundProcessingEnabled === false,
    pilotAllowlistConfigured: Boolean(config?.pilotAllowlist && config.pilotAllowlist !== "[]"),
    wahaWebhookSecret: Boolean(process.env.MARIE_WAHA_WEBHOOK_SECRET),
    internalToken: Boolean(process.env.MARIE_INTERNAL_TOKEN),
    wahaApiUrl: Boolean(process.env.MARIE_WAHA_API_URL),
    wahaApiKey: Boolean(process.env.MARIE_WAHA_API_KEY),
    telegramBotToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    telegramOwnerPrivateId: isPrivateTelegramOwnerId(process.env.MARIE_TELEGRAM_OWNER_ID),
    telegramWebhookSecret: Boolean(process.env.MARIE_TELEGRAM_WEBHOOK_SECRET),
    escalationExplicitlyEnabled: config?.escalationEnabled === true,
    activationCodeUnlocked: false,
  };
  return { readyForActivation: false, checks };
}
