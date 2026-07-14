// In-memory verification progress store
// Tracks batch address verification progress for polling

export interface VerificationProgress {
  sessionId: string;
  total: number;
  done: number;
  status: "running" | "complete" | "error";
  currentOrder?: string;
  results: Array<{
    orderId: string;
    verified: boolean;
    confidence: "high" | "medium" | "low";
    note: string;
    normalizedAddress?: string;
    suggestedCity?: string;
    suggestedZone?: number;
  }>;
  errors: Array<{
    orderId: string;
    error: string;
  }>;
  summary: {
    verified: number;
    unverified: number;
    failed: number;
  };
  startedAt: number;
}

const sessions = new Map<string, VerificationProgress>();

// Clean up old sessions after 10 minutes
function cleanup() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.startedAt > 600000) {
      sessions.delete(id);
    }
  }
}

export function createSession(orderIds: string[]): string {
  cleanup();
  const sessionId = `verify_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  sessions.set(sessionId, {
    sessionId,
    total: orderIds.length,
    done: 0,
    status: "running",
    results: [],
    errors: [],
    summary: { verified: 0, unverified: 0, failed: 0 },
    startedAt: Date.now(),
  });
  return sessionId;
}

export function updateProgress(
  sessionId: string,
  update: {
    done?: number;
    currentOrder?: string;
    result?: VerificationProgress["results"][0];
    error?: { orderId: string; error: string };
    status?: "running" | "complete" | "error";
  }
): void {
  const session = sessions.get(sessionId);
  if (!session) return;

  if (update.done !== undefined) session.done = update.done;
  if (update.currentOrder !== undefined) session.currentOrder = update.currentOrder;
  if (update.status !== undefined) session.status = update.status;

  if (update.result) {
    session.results.push(update.result);
    if (update.result.verified) {
      session.summary.verified++;
    } else {
      session.summary.unverified++;
    }
  }

  if (update.error) {
    session.errors.push(update.error);
    session.summary.failed++;
  }
}

export function getProgress(sessionId: string): VerificationProgress | null {
  return sessions.get(sessionId) || null;
}

export function completeSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.status = "complete";
  }
}

export function failSession(sessionId: string): void {
  const session = sessions.get(sessionId);
  if (session) {
    session.status = "error";
  }
}
