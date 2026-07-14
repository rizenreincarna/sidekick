import { db } from "./db";
import fs from "fs";

// ============ FCM PUSH SENDER ============
// Sends push notifications to Android devices via Firebase Cloud Messaging (HTTP v1 API).
// Authenticates using a service account's private key (minted OAuth2 access token via JWT).
// The service account JSON is stored server-side only and NEVER shipped to the app.
//
// CONFIG (admin Setting table):
//   ai_fcm_project_id       : Firebase project id (e.g. "sidekick-a57aa")
//   ai_fcm_service_account  : path to the service account JSON on the server, OR the full
//                             JSON contents. If it parses as JSON it's treated as contents;
//                             otherwise as a file path.
//   ai_fcm_legacy_key       : (optional fallback) legacy server key — used only if v1
//                             credentials are not configured. Lets the server send pushes
//                             without a service account file when desired.
//
// If FCM is not configured at all, pushes silently no-op and the Android app's foreground
// polling fallback handles notifications.

interface FcmPayload {
  title: string;
  body: string;
  channel?: "orders" | "sos" | "system" | "chat";
  actionUrl?: string | null;
}

interface FcmConfig {
  projectId: string;
  serviceAccountJson: string; // raw JSON string OR a file path
  legacyKey?: string; // optional legacy fallback
}

let cachedConfig: FcmConfig | null | undefined = undefined; // undefined = not yet loaded
let cachedConfigAt = 0;
const CONFIG_TTL_MS = 60_000;

async function getConfig(): Promise<FcmConfig | null> {
  if (cachedConfig !== undefined && Date.now() - cachedConfigAt < CONFIG_TTL_MS) {
    return cachedConfig;
  }
  try {
    const adminUser = await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
    if (!adminUser) { cachedConfig = null; cachedConfigAt = Date.now(); return null; }
    const keys = ["ai_fcm_project_id", "ai_fcm_service_account", "ai_fcm_legacy_key"];
    const settings = await db.setting.findMany({ where: { userId: adminUser.id, key: { in: keys } } });
    const cfg: Record<string, string> = {};
    for (const s of settings) cfg[s.key] = s.value;

    const projectId = cfg.ai_fcm_project_id || "";
    const serviceAccount = cfg.ai_fcm_service_account || "";
    const legacyKey = cfg.ai_fcm_legacy_key || "";

    // Prefer the v1 path; fall back to legacy key if only that is set.
    if (projectId && serviceAccount) {
      cachedConfig = { projectId, serviceAccountJson: serviceAccount, legacyKey: legacyKey || undefined };
    } else if (legacyKey) {
      cachedConfig = { projectId, serviceAccountJson: "", legacyKey };
    } else {
      cachedConfig = null;
    }
    cachedConfigAt = Date.now();
    return cachedConfig;
  } catch {
    return null;
  }
}

// ---- OAuth2 access token (JWT bearer) from the service account ----
// We implement a minimal JWT signer using Web Crypto to avoid pulling in the
// firebase-admin SDK. The token is cached until ~5 min before expiry.

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

let cachedAccessToken: { token: string; expiresAt: number; saEmail: string } | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  // Strip headers/footers and newlines, base64-decode to DER, then import as PKCS#8.
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const der = Buffer.from(b64, "base64");
  return der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength);
}

async function getAccessToken(config: FcmConfig): Promise<string | null> {
  let sa: ServiceAccount;
  let raw = config.serviceAccountJson.trim();
  // If it's a file path (doesn't start with '{'), read the file.
  if (!raw.startsWith("{")) {
    try {
      raw = fs.readFileSync(raw, "utf8").trim();
    } catch (e) {
      console.error("[fcm] could not read service account file:", e);
      return null;
    }
  }
  try {
    sa = JSON.parse(raw) as ServiceAccount;
  } catch (e) {
    console.error("[fcm] invalid service account JSON:", e);
    return null;
  }
  if (!sa.client_email || !sa.private_key) return null;

  // Invalidate the cached token if the service account changed (rotation/revocation).
  if (cachedAccessToken && cachedAccessToken.saEmail !== sa.client_email) {
    cachedAccessToken = null;
  }

  if (cachedAccessToken && Date.now() < cachedAccessToken.expiresAt - 5 * 60_000) {
    return cachedAccessToken.token;
  }

  // Build the JWT header + claim set.
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = `${enc(header)}.${enc(claims)}`;

  try {
    // Web Crypto importKey for RS256
    const subtle = globalThis.crypto.subtle;
    const keyData = pemToArrayBuffer(sa.private_key);
    const key = await subtle.importKey(
      "pkcs8",
      keyData,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
    const signature = Buffer.from(sig).toString("base64url");
    const jwt = `${unsigned}.${signature}`;

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error(`[fcm] OAuth token exchange failed ${res.status}: ${txt.slice(0, 200)}`);
      return null;
    }
    const tok = (await res.json()) as { access_token: string; expires_in: number };
    cachedAccessToken = {
      token: tok.access_token,
      expiresAt: Date.now() + (tok.expires_in || 3600) * 1000,
      saEmail: sa.client_email,
    };
    return cachedAccessToken.token;
  } catch (e) {
    console.error("[fcm] JWT signing failed:", e);
    return null;
  }
}

async function sendV1(projectId: string, accessToken: string, tokens: string[], data: Record<string, string>): Promise<void> {
  // The v1 API sends one message at a time. To batch, we send a multicast by issuing
  // parallel requests (one per token). For typical fan-out sizes this is fine; for very
  // large fan-outs a topic/condition or a batch endpoint would be used.
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
  // Include a `notification` block so FCM auto-displays the notification even when the
  // app is killed/backgrounded (data-only messages can be dropped/batched by Android Doze).
  // The `data` block carries channel/routing for the app's notification channels.
  const title = data.title || "HERO Sidekick";
  const body = data.body || "";
  const bodyBuilder = (token: string) => ({
    message: {
      token,
      data,
      notification: { title, body },
      android: {
        priority: "high",
        notification: {
          channel_id: data.channel || "system",
          default_vibrate_timings: true,
        },
      },
    },
  });

  const results = await Promise.allSettled(
    tokens.map(t =>
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(bodyBuilder(t)),
      })
    )
  );
  const failed = results.filter(r => r.status === "rejected" || (r.status === "fulfilled" && !r.value.ok)).length;
  if (failed > 0) console.error(`[fcm] v1 send: ${failed}/${tokens.length} failed`);
}

async function sendLegacy(serverKey: string, tokens: string[], data: Record<string, string>): Promise<void> {
  // FCM legacy HTTP API supports multicast to up to 1000 tokens in one call (fallback path).
  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `key=${serverKey}`,
    },
    body: JSON.stringify({
      registration_ids: tokens,
      data,
      priority: "high",
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    console.error(`[fcm] legacy send failed ${res.status}: ${txt.slice(0, 200)}`);
  }
}

/** Send a push to all active device tokens for a single user. Best-effort, never throws. */
export async function sendPushToUser(userId: string, payload: FcmPayload): Promise<void> {
  return sendPushToUsers([userId], payload);
}

/**
 * Batched fan-out: fetch config once, query ALL recipients' tokens in a single DB query,
 * then send via v1 (preferred) or legacy (fallback). Best-effort, never throws.
 */
export async function sendPushToUsers(userIds: string[], payload: FcmPayload): Promise<void> {
  const targets = userIds.filter(Boolean);
  if (targets.length === 0) return;
  try {
    const config = await getConfig();
    if (!config) return; // FCM not configured — Android poll fallback covers notifications.

    const tokens = await db.deviceToken.findMany({
      where: { userId: { in: targets }, isActive: true },
      select: { token: true },
    });
    if (tokens.length === 0) return;

    const data: Record<string, string> = {
      title: payload.title.slice(0, 200),
      body: payload.body.slice(0, 1000),
      channel: payload.channel || "system",
      notifId: String(Date.now()),
    };
    if (payload.actionUrl) data.actionUrl = payload.actionUrl.slice(0, 500);

    if (config.serviceAccountJson) {
      // v1 path (modern, supported)
      const accessToken = await getAccessToken(config);
      if (accessToken) {
        await sendV1(config.projectId, accessToken, tokens.map(t => t.token), data);
      } else if (config.legacyKey) {
        await sendLegacy(config.legacyKey, tokens.map(t => t.token), data);
      }
    } else if (config.legacyKey) {
      await sendLegacy(config.legacyKey, tokens.map(t => t.token), data);
    }
  } catch (error) {
    // Never let push failure break the main flow.
    console.error("[fcm] sendPushToUsers failed:", error);
  }
}

/** Notify Support/Admin users about a new SOS request. Excludes the raiser. */
export async function notifySosRaised(targetUserIds: string[], sosTitle: string, sosBody: string): Promise<void> {
  await sendPushToUsers(targetUserIds, { title: sosTitle, body: sosBody, channel: "sos" });
}

/** Notify a hero a new order was assigned/scheduled/reassigned to them. */
export async function notifyOrderAssigned(userId: string, orderId: string, city: string, scheduledDate: string): Promise<void> {
  await sendPushToUser(userId, {
    title: `New order #${orderId}`,
    body: `${city} — scheduled ${scheduledDate}. Open to confirm.`,
    channel: "orders",
    actionUrl: "/orders",
  });
}

/** Mirror a system notification as a push. */
export async function notifySystemNotification(userId: string, title: string, message: string): Promise<void> {
  await sendPushToUser(userId, { title, body: message, channel: "system" });
}

/** Notify about a new AI chat / admin message. */
export async function notifyChatMessage(userId: string, title: string, message: string): Promise<void> {
  await sendPushToUser(userId, { title, body: message, channel: "chat", actionUrl: "/chat" });
}