import { z } from "zod";
import { db } from "./db";

/**
 * Marie automation configuration schema.
 *
 * Gates are loosened from the initial DRY_RUN-only lockdown to permit PILOT mode,
 * but LIVE mode remains blocked at the schema level until explicitly approved.
 * The refine ensures escalation and inbound processing can only be enabled when
 * the pilot is active — they can't be silently turned on in DRY_RUN.
 */
export const marieConfigSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["DRY_RUN", "PILOT"]),
  contactStartHour: z.number().int().min(0).max(23),
  contactEndHour: z.number().int().min(1).max(23),
  normalCapacity: z.literal(20),
  maxCapacity: z.literal(25),
  pilotAllowlist: z.array(z.string().max(30)).max(100),
  contactMode: z.enum(["ALL", "WHITELIST", "STOPPED"]),
  orderAllowlist: z.array(z.string().trim().regex(/^[\w-]{2,30}$/, "Invalid order reference")).max(500),
  maxMessagesPerRun: z.number().int().min(1).max(100),
  maxMessagesPerHour: z.number().int().min(1).max(500),
  maxMessagesPerDay: z.number().int().min(1).max(2000),
  maxMessagesPerTick: z.number().int().min(1).max(10).default(3),
  maxRetries: z.number().int().min(0).max(10),
  wahaSessionName: z.string().trim().min(1).max(100).nullable(),
  telegramOwnerId: z.string().trim().min(1).max(100).nullable(),
  escalationEnabled: z.boolean(),
  inboundProcessingEnabled: z.boolean(),
}).strict()
  .refine(value => value.contactStartHour < value.contactEndHour, {
    message: "contactStartHour must be before contactEndHour",
    path: ["contactEndHour"],
  })
  .refine(value => !value.escalationEnabled || (value.enabled && value.mode === "PILOT"), {
    message: "Escalation can only be enabled in PILOT mode",
    path: ["escalationEnabled"],
  })
  .refine(value => !value.inboundProcessingEnabled || (value.enabled && value.mode === "PILOT"), {
    message: "Inbound processing can only be enabled in PILOT mode",
    path: ["inboundProcessingEnabled"],
  })
  .refine(value => value.mode !== "PILOT" || value.pilotAllowlist.length > 0, {
    message: "PILOT mode requires at least one phone number in the allowlist",
    path: ["pilotAllowlist"],
  });

export type MarieConfigInput = z.infer<typeof marieConfigSchema>;

export function parseMarieConfigInput(value: unknown): MarieConfigInput {
  return marieConfigSchema.parse(value);
}

export const DEFAULT_MARIE_CONFIG: MarieConfigInput = {
  enabled: false,
  mode: "DRY_RUN",
  contactStartHour: 8,
  contactEndHour: 20,
  normalCapacity: 20,
  maxCapacity: 25,
  pilotAllowlist: [],
  contactMode: "WHITELIST",
  orderAllowlist: [],
  maxMessagesPerRun: 10,
  maxMessagesPerHour: 20,
  maxMessagesPerDay: 100,
  maxMessagesPerTick: 3,
  maxRetries: 3,
  wahaSessionName: null,
  telegramOwnerId: null,
  escalationEnabled: false,
  inboundProcessingEnabled: false,
};

export async function getMarieConfig(): Promise<MarieConfigInput> {
  // Always read from the DB on every call. The config is the kill switch
  // and must never be stale. The performance cost of one indexed read is
  // negligible compared to the risk of using a cached missed-flip.
  const config = await db.marieAutomationConfig.findUnique({ where: { id: "default" } });
  if (!config) return DEFAULT_MARIE_CONFIG;
  let pilotAllowlist: string[] = [];
  try {
    const parsed = JSON.parse(config.pilotAllowlist);
    if (Array.isArray(parsed) && parsed.every(item => typeof item === "string")) pilotAllowlist = parsed;
  } catch {
    pilotAllowlist = [];
  }
  let orderAllowlistParsed: unknown = [];
  try {
    orderAllowlistParsed = JSON.parse(config.orderAllowlist);
  } catch {
    orderAllowlistParsed = [];
  }
  const orderAllowlist = Array.isArray(orderAllowlistParsed)
    ? orderAllowlistParsed.filter((item): item is string => typeof item === "string")
    : [];

  return marieConfigSchema.parse({
    enabled: config.enabled,
    mode: config.mode as "DRY_RUN" | "PILOT",
    contactStartHour: config.contactStartHour,
    contactEndHour: config.contactEndHour,
    normalCapacity: config.normalCapacity,
    maxCapacity: config.maxCapacity,
    pilotAllowlist,
    contactMode: (["ALL", "WHITELIST", "STOPPED"].includes(config.contactMode) ? config.contactMode : "WHITELIST") as "ALL" | "WHITELIST" | "STOPPED",
    orderAllowlist,
    maxMessagesPerRun: config.maxMessagesPerRun,
    maxMessagesPerHour: config.maxMessagesPerHour,
    maxMessagesPerDay: config.maxMessagesPerDay,
    maxRetries: config.maxRetries,
    wahaSessionName: config.wahaSessionName,
    telegramOwnerId: config.telegramOwnerId,
    escalationEnabled: config.escalationEnabled,
    inboundProcessingEnabled: config.inboundProcessingEnabled,
  });
}
