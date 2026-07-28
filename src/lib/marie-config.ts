import { z } from "zod";
import { db } from "./db";

export const marieConfigSchema = z.object({
  enabled: z.literal(false),
  mode: z.literal("DRY_RUN"),
  contactStartHour: z.number().int().min(0).max(23),
  contactEndHour: z.number().int().min(1).max(23),
  normalCapacity: z.literal(20),
  maxCapacity: z.literal(25),
  pilotAllowlist: z.array(z.string().max(30)).max(100),
  maxMessagesPerRun: z.number().int().min(1).max(100),
  maxMessagesPerHour: z.number().int().min(1).max(500),
  maxMessagesPerDay: z.number().int().min(1).max(2000),
  maxRetries: z.number().int().min(0).max(10),
  wahaSessionName: z.string().trim().min(1).max(100).nullable(),
  telegramOwnerId: z.string().trim().min(1).max(100).nullable(),
  escalationEnabled: z.literal(false),
  inboundProcessingEnabled: z.literal(false),
}).strict().refine(value => value.contactStartHour < value.contactEndHour, {
  message: "contactStartHour must be before contactEndHour",
  path: ["contactEndHour"],
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
  maxMessagesPerRun: 10,
  maxMessagesPerHour: 20,
  maxMessagesPerDay: 100,
  maxRetries: 3,
  wahaSessionName: null,
  telegramOwnerId: null,
  escalationEnabled: false,
  inboundProcessingEnabled: false,
};

export async function getMarieConfig(): Promise<MarieConfigInput> {
  const config = await db.marieAutomationConfig.findUnique({ where: { id: "default" } });
  if (!config) return DEFAULT_MARIE_CONFIG;
  let pilotAllowlist: string[] = [];
  try {
    const parsed = JSON.parse(config.pilotAllowlist);
    if (Array.isArray(parsed) && parsed.every(item => typeof item === "string")) pilotAllowlist = parsed;
  } catch {
    pilotAllowlist = [];
  }
  return marieConfigSchema.parse({
    enabled: false,
    mode: "DRY_RUN",
    contactStartHour: config.contactStartHour,
    contactEndHour: config.contactEndHour,
    normalCapacity: config.normalCapacity,
    maxCapacity: config.maxCapacity,
    pilotAllowlist,
    maxMessagesPerRun: config.maxMessagesPerRun,
    maxMessagesPerHour: config.maxMessagesPerHour,
    maxMessagesPerDay: config.maxMessagesPerDay,
    maxRetries: config.maxRetries,
    wahaSessionName: config.wahaSessionName,
    telegramOwnerId: config.telegramOwnerId,
    escalationEnabled: false,
    inboundProcessingEnabled: false,
  });
}
