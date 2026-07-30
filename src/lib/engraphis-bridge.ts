/**
 * Engraphis memory bridge for the Sidekick application.
 *
 * Records durable application events — order changes, settings updates, completions,
 * Marie automation actions — so they can be recalled later by any agent or tool
 * connected to the same Engraphis instance.
 *
 * Calls the Engraphis Python API directly via a tiny persistent script, avoiding
 * the 15-second model-loading overhead of the CLI on every invocation.
 * Every call is fire-and-forget: a failure to record a memory must never block
 * the application's primary operation.
 */

import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const ENGRAPHIS_DB = process.env.ENGRAPHIS_DB_PATH ?? "/root/.local/share/engraphis/engraphis.db";
const PYTHON = "/usr/local/lib/hermes-agent/venv/bin/python3";
const BRIDGE_DIR = "/tmp/engraphis-sidekick";
const BRIDGE_SCRIPT = join(BRIDGE_DIR, "record.py");

let scriptInitialized = false;

/**
 * The Python bridge script. Reads JSON from stdin, calls MemoryService.remember,
 * prints the result as JSON. Stays alive between calls — no model reload.
 */
const BRIDGE_CODE = `
import sys, json, os
os.environ["ENGRAPHIS_DB_PATH"] = sys.argv[1]
from engraphis.core.engine import MemoryEngine
from engraphis.service import MemoryService
engine = MemoryEngine.create(db_path=sys.argv[1])
svc = MemoryService(engine, allowed_workspaces=["sidekick","pi","shared","marie"])
sys.stdout.write("READY\\n")
sys.stdout.flush()
for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        req = json.loads(line)
        result = svc.remember(
            content=req["content"],
            workspace="sidekick",
            title=req.get("title",""),
            mtype=req.get("mtype","episodic"),
            importance=req.get("importance",0.5),
            trusted=True,
            source="sidekick-app",
        )
        sys.stdout.write(json.dumps({"ok": True, "id": result.get("id")}) + "\\n")
    except Exception as e:
        sys.stdout.write(json.dumps({"ok": False, "error": str(e)[:200]}) + "\\n")
    sys.stdout.flush()
`;

let bridgeProcess: ReturnType<typeof spawn> | null = null;

function ensureBridge(): void {
  if (scriptInitialized) return;
  try {
    mkdirSync(BRIDGE_DIR, { recursive: true, mode: 0o700 });
    writeFileSync(BRIDGE_SCRIPT, BRIDGE_CODE, { mode: 0o600 });
    scriptInitialized = true;
  } catch {
    // If we can't write the script, falls back to nothing — silent.
  }
}

let pendingWrites: string[] = [];
let processReady = false;

function startBridge(): void {
  ensureBridge();
  if (bridgeProcess) return;
  try {
    bridgeProcess = spawn(PYTHON, [BRIDGE_SCRIPT, ENGRAPHIS_DB], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ENGRAPHIS_DB_PATH: ENGRAPHIS_DB },
    });

    bridgeProcess.stdout?.on("data", (data: Buffer) => {
      const text = data.toString().trim();
      if (!text) return;
      if (text.startsWith("READY")) {
        processReady = true;
        // Flush any pending writes.
        for (const w of pendingWrites) {
          bridgeProcess?.stdin?.write(w);
        }
        pendingWrites = [];
        return;
      }
      try {
        JSON.parse(text); // Consume the response (fire-and-forget).
      } catch {
        // Ignore unparseable output.
      }
    });

    bridgeProcess.on("error", () => {
      processReady = false;
      bridgeProcess = null;
    });

    bridgeProcess.on("exit", () => {
      processReady = false;
      bridgeProcess = null;
    });
  } catch {
    bridgeProcess = null;
  }
}

export type EventType =
  | "ORDER_CREATED"
  | "ORDER_UPDATED"
  | "ORDER_STATUS_CHANGED"
  | "ORDER_SCHEDULED"
  | "ORDER_COMPLETED"
  | "ORDER_CANCELED"
  | "SETTINGS_UPDATED"
  | "MARIE_CONFIG_UPDATED"
  | "MARIE_SCHEDULED"
  | "MARIE_CONTACTED"
  | "MARIE_BOOKED"
  | "MARIE_AUTO_CANCELED"
  | "MARIE_ESCALATION"
  | "MARIE_SMS_SENT"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "BULK_OPERATION"
  | "SYSTEM_EVENT";

export interface MemoryRecord {
  type: EventType;
  summary: string;
  details: Record<string, unknown>;
  timestamp?: Date;
}

/**
 * Records a memory in Engraphis. Fire-and-forget: errors are never thrown.
 */
export async function recordMemory(input: MemoryRecord): Promise<void> {
  const content = formatMemoryContent(input);
  const title = `${input.type}: ${input.summary.slice(0, 80)}`;
  const payload = JSON.stringify({
    content,
    title,
    mtype: "episodic",
    importance: 0.5,
  }) + "\n";

  try {
    if (!bridgeProcess) startBridge();
    if (processReady && bridgeProcess?.stdin?.writable) {
      bridgeProcess.stdin.write(payload);
    } else {
      // Buffer until the bridge is ready (max 100 items to avoid memory growth).
      if (pendingWrites.length < 100) pendingWrites.push(payload);
    }
  } catch {
    // Never block the application path on memory recording failure.
  }
}

/**
 * Records an order status change with enough context for later recall.
 */
export async function recordOrderEvent(input: {
  type: EventType;
  orderId: string;
  customerName?: string;
  beforeStatus?: string;
  afterStatus?: string;
  scheduledDate?: string | null;
  points?: number;
  zone?: number;
  actor?: string;
  reason?: string;
}): Promise<void> {
  await recordMemory({
    type: input.type,
    summary: `Order ${input.orderId}: ${input.beforeStatus ?? "?"} → ${input.afterStatus ?? "?"}${input.reason ? ` (${input.reason})` : ""}`,
    details: {
      orderId: input.orderId,
      customerName: input.customerName,
      beforeStatus: input.beforeStatus,
      afterStatus: input.afterStatus,
      scheduledDate: input.scheduledDate,
      points: input.points,
      zone: input.zone,
      actor: input.actor ?? "operator",
      reason: input.reason,
    },
  });
}

/**
 * Records a settings or config change.
 */
export async function recordSettingsEvent(input: {
  type: EventType;
  key: string;
  oldValue?: string;
  newValue?: string;
  actor?: string;
}): Promise<void> {
  await recordMemory({
    type: input.type,
    summary: `Setting ${input.key} changed${input.oldValue ? ` from "${truncate(input.oldValue)}"` : ""} to "${truncate(input.newValue ?? "")}"`,
    details: {
      key: input.key,
      oldValue: input.oldValue,
      newValue: input.newValue,
      actor: input.actor ?? "operator",
    },
  });
}

function formatMemoryContent(input: MemoryRecord): string {
  const ts = (input.timestamp ?? new Date()).toISOString();
  const lines = [
    `[${input.type}] ${ts}`,
    input.summary,
  ];
  if (Object.keys(input.details).length > 0) {
    lines.push(JSON.stringify(input.details, null, 2));
  }
  return lines.join("\n");
}

function truncate(s: string, max = 100): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}
