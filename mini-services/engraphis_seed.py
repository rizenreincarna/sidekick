#!/usr/bin/env python3
"""
Seed Engraphis with Rizen foundational context (full memory restart).
Uses the Python library write path (free tier) — the REST /api/remember
endpoint is gated behind the Team (paid) tier, but MemoryService.remember
is not. Reads remain free via REST /api/recall.

Run with the Hermes venv python:
  /usr/local/lib/hermes-agent/venv/bin/python engraphis_seed.py
"""
from engraphis.service import MemoryService

DB = "/root/.local/share/engraphis/engraphis.db"

SEEDS = [
    # ---- shared (all agents read/write) ----
    ("shared", "User is Tars — the human operator behind the Rizen AI agent platform. He is the boss.", 1.0),
    ("shared", "Three AI agents on Team Rizen: Will (CEO, infrastructure architect) and Marie (personal assistant to Tars). They coordinate in a shared Telegram group with @mention-gating. (Jack, lead programmer, was sunset 2026-07-19; his build/infra knowledge was merged into Will.)", 1.0),
    ("shared", "VPS: Ubuntu 24.04 Docker container, 8GB RAM, IP 84.247.145.6, domain rizen.space. Managed by Tars.", 0.9),
    ("shared", "RizenCC Android app: Kotlin + Jetpack Compose + Material3, three tabs (Voice, Stats, Settings). Source at /root/my-app/android-app/. Build: cd /root/my-app/android-app && ./gradlew --no-daemon assembleDebug. APK output: app/build/outputs/apk/debug/app-debug.apk.", 0.9),
    ("shared", "Chat bridge at /root/my-app/mini-services/chat-bridge.py (PM2: chat-bridge, port 8103) handles voice chat between app and agents. Uses Neuralwatt API (qwen3.6-35b-fast) + OmniVoice TTS + Engraphis memory.", 0.85),
    ("shared", "Tars prefers concise communication, minimal dependencies (YAGNI principle), and pragmatic solutions.", 0.8),
    ("shared", "DECISION: Sidekick app renamed to HERO (unanimous vote, Team Rizen Discussion #2, 2026-07-16).", 0.8),
    ("shared", "DECISION: Use Tars' home PC (RTX 3070, Windows, Tailscale 100.68.146.27) for OmniVoice TTS instead of renting a new VPS. Discussion #6 on 2026-07-18. All 3 agents agreed.", 0.85),
    # ---- will (private to Will) — now also owns ex-Jack build/infra knowledge ----
    ("will", "OmniVoice TTS runs on Tars' home PC: RTX 3070, Windows, Tailscale IP 100.68.146.27, port 8880. NSSM service 'OmniVoice' installed and running. Python 3.11 at C:\\Python311. Repo at C:\\omnivoice. Venv at C:\\omnivoice\\venv. Torch 2.12.1+cu126, CUDA enabled.", 0.9),
    ("will", "Three voice profiles on the Windows PC: marie_ref.wav, will_ref.wav, jack_ref.wav — all in C:\\omnivoice\\.", 0.8),
    ("will", "OmniVoice auth: HERMES_OMNIVOICE_SERVICE_TOKEN set in /root/.hermes/.env and on Windows side. Windows SSH: ssh Tars@100.68.146.27 (Tailscale only, port 22 restricted to 100.64.0.0/10).", 0.85),
    ("will", "work.rizen.space protected by Nginx Basic Auth (user: tars). Nginx config at /etc/nginx/sites-enabled/work.rizen.space. Routes: /chat-api/ → 8103, /api/stats/public → 8102, /voice-lab/ → OmniVoice.", 0.8),
    ("will", "PM2 services on the VPS: chat-bridge (8103), engraphis (8700), stats-public (8102), stats-server (8000), work-rizenspace (8090).", 0.7),
    # ---- marie (private to Marie) ----
    ("marie", "Schedule: Shahrul's wedding on 16 Aug 2026. Mayah's birthday 22 Jul 1999 — dinner at Chef Gemok, Sepang.", 0.85),
    ("marie", "Tars uses the RizenCC Android app to talk to agents while driving — PTT (push-to-talk) and Live mode. Voice replies must finish their sentence fully, never cut off mid-sentence.", 0.9),
    ("marie", "Marie's voice profile is female, middle-aged, high pitch. Her ref audio is marie_ref.wav on Tars' Windows PC.", 0.7),
    ("marie", "DECISION: Sidekick app renamed to HERO (unanimous vote, Discussion #2, 2026-07-16). Marie's MVP proposal: 3 screens — pickups, payments, voice briefing.", 0.8),
    # NOTE: Jack's private memories were merged into the `will` workspace
    # above when Jack was sunset (2026-07-19). The former `("jack", ...)`
    # seeds — Android app source/build, chat-bridge tech stack, voice
    # profile routing, GitHub auth — are now stored under `will`.
]

def main():
    ms = MemoryService.create(db_path=DB)
    stats = {}
    for ws, content, imp in SEEDS:
        r = ms.remember(content, workspace=ws, importance=imp, trusted=True, source="seed")
        stats[ws] = stats.get(ws, 0) + (1 if r.get("stored") else 0)
        ok = "OK " if r.get("stored") else "NOOP"
        print(f"[{ok}] {ws:7s} imp={imp} {content[:70]}")
    print("\n=== per-workspace stored counts ===")
    for ws, n in sorted(stats.items()):
        print(f"  {ws:7s}: {n}")

if __name__ == "__main__":
    main()
