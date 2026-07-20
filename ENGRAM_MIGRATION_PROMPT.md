# Rizen Memory System Migration: Mnemosyne → Engraphis

## Context

You are working on **Rizen** — an AI agent platform with three Hermes-powered agents:
- **Will** 🐕 — CEO & Infrastructure Architect (profile: `will`)
- **Marie** 🐱 — Personal AI Assistant to Tars (profile: `marie`)
- **Jack** 🐸 — Lead Programmer (profile: `jack`)

These agents run on a Hermes Agent framework on a Linux VPS (Ubuntu 24.04, Docker, 8GB RAM). Currently each agent uses **Mnemosyne** (SQLite-backed memory system) for persistent context. We are migrating all three agents to **Engraphis** (open-source local-first memory engine for AI agents — https://engraphis.com / https://github.com/Coding-Dev-Tools/engraphis) for better semantic search, forgetting-curve retention, and a proper knowledge-graph WebUI.

**This is a full memory restart** — we are NOT migrating existing memories. We want to start fresh with Engraphis as the new memory system.

## Memory architecture (4 workspaces)

Engraphis uses a `workspace → repo → session` scoping hierarchy. We want **four workspaces**:

| Workspace | Who reads | Who writes | Purpose |
|-----------|-----------|------------|---------|
| `will` | Will only | Will only | Will's private memories (infra, VPS, architecture) |
| `marie` | Marie only | Marie only | Marie's private memories (schedules, personal assistant context) |
| `jack` | Jack only | Jack only | Jack's private memories (codebase, build commands, dev context) |
| `shared` | **All 3 agents** | **All 3 agents** | Team-wide facts — who Tars is, the Rizen platform, decisions all agents must agree on |

The **shared** workspace is the team's common ground: who Tars is, what RizenCC is, what the three agents agreed on, the project's north star. An agent queries its own private workspace AND the shared workspace on every turn, then gets back a merged context block.

## Current state (what to remove / replace)

### Mnemosyne setup (to be archived and removed)

Three SQLite databases, each with its own PM2 dashboard process:

| Agent | DB Path | PM2 Process | Port |
|-------|---------|-------------|------|
| Will | `/root/.hermes/mnemosyne/data/mnemosyne.db` | `mnemosyne-dashboard` | 8765 |
| Jack | `/root/.hermes/profiles/jack/mnemosyne/data/mnemosyne.db` | `mnemosyne-dashboard-jack` | 8766 |
| Marie | `/root/.hermes/profiles/marie/mnemosyne/data/mnemosyne.db` | `mnemosyne-dashboard-marie` | 8767 |

Hermes agents also access Mnemosyne via **MCP tools** (`mcp__mnemosyne__*`) configured in `/root/.hermes/config.yaml` and per-profile configs.

### Chat bridge (must be migrated, not replaced)

`/root/my-app/mini-services/chat-bridge.py` (PM2: `chat-bridge`, port 8103) handles voice chat between the RizenCC Android app and the three agents. Currently queries each agent's Mnemosyne dashboard via HTTP before each chat:

```python
MNEMOSYNE = {
    "marie": "http://127.0.0.1:8767/api/search?q=",
    "will":  "http://127.0.0.1:8765/api/search?q=",
    "jack":  "http://127.0.0.1:8766/api/search?q=",
}
def _fetch_memory(agent, query):
    # keyword extraction + HTTP GET → formatted memory context string
```

The bridge's `POST /chat` contract (`{"agent","message"}` → `{"reply","agent","audio"}`) **must stay identical** so the Android app keeps working. Only the memory backend changes.

## Target state

### 1. Install Engraphis

Install the self-hosted Engraphis engine. Single install command:

```bash
pip install "engraphis[all]"
```

This gets the engine, MCP server, dashboard, code-graph, and platform extras in one shot. Run with `python3` (3.12 on this VPS). The core only needs numpy — embeddings are local, **no API keys, no cloud**.

Install into the existing Hermes venv: `/usr/local/lib/hermes-agent/venv/`. Verify with `engraphis-dashboard --help`.

### 2. Start the dashboard + REST API as a PM2 process

```bash
pm2 start "engraphis-dashboard --host 127.0.0.1 --port 8700" --name engraphis
pm2 save
```

Engraphis dashboard + REST API will run on **port 8700** (`http://127.0.0.1:8700`). The dashboard is optional to look at but **the REST API is what the chat bridge calls**. Single SQLite file lives on the VPS — no cloud, no signup.

### 3. Initialize the four workspaces

Engraphis supports multi-workspace. Create four workspaces via the REST API or Python library:

```
POST http://127.0.0.1:8700/api/workspace  {"name":"will","description":"Will's private memory"}
POST http://127.0.0.1:8700/api/workspace  {"name":"marie","description":"Marie's private memory"}
POST http://127.0.0.1:8700/api/workspace  {"name":"jack","description":"Jack's private memory"}
POST http://127.0.0.1:8700/api/workspace  {"name":"shared","description":"Team-wide shared memory, all agents read/write"}
```

Verify with: `GET http://127.0.0.1:8700/api/workspaces` → returns the 4 workspaces.

### 4. Update the chat bridge to query Engraphis

In `/root/my-app/mini-services/chat-bridge.py`, replace the Mnemosyne `_fetch_memory` function with an Engraphis query that hits BOTH the agent's private workspace AND the shared workspace:

```python
ENGRAPHIS_URL = "http://127.0.0.1:8700"

def _fetch_memory(agent, query):
    # Query agent's private workspace
    private = _engraphis_recall(query, workspace=agent)
    # Query shared workspace
    shared = _engraphis_recall(query, workspace="shared")
    # Merge, dedupe, format
    return _format_context(private, shared)

def _engraphis_recall(query, workspace):
    # GET http://127.0.0.1:8700/api/recall?q=<query>&workspace=<workspace>
    # Returns ranked memories with score breakdowns
    # Take top 3-5 by score
```

Engraphis uses **hybrid search** (vector + lexical + graph + importance + recency + retention) so natural language queries "what do you know about the server?" work natively — **drop the keyword extraction hack from the old Mnemosyne code**. Pass the user's query as-is.

The merged context should be injected into the LLM messages as a user turn right before the user's actual question — this is the pattern that already works.

### 5. Wire Engraphis MCP into Hermes (optional but preferred if it works)

Engraphis ships an MCP server (`engraphis-mcp`). If it works cleanly with Hermes, wire it into `/root/.hermes/config.yaml` and per-profile configs so the Hermes agents themselves have direct durable memory across sessions — not just the chat bridge.

If the MCP integration has friction, skip it and rely on the chat bridge's REST queries. The bridge is the critical path; the in-session MCP is a nice-to-have. If you skip MCP, note why in your report.

Engraphis has 28 MCP tools — `engraphis_remember`, `engraphis_recall`, `engraphis_why`, `engraphis_timeline`, `engraphis_forget`, etc. The Hermes agents (running with `hermes -p <profile>`) should be able to call `engraphis_remember` to persist facts and `engraphis_recall` to retrieve them.

If you do wire the MCP, ensure each Hermes profile scopes to the right workspace:
- `will` profile → default workspace `will`
- `marie` profile → default workspace `marie`
- `jack` profile → default workspace `jack`
- All three also write to `shared` for team-wide facts

### 6. Full memory restart — archive Mnemosyne, seed Engraphis

Archive (don't delete) the old Mnemosyne DBs:
```bash
mkdir -p /root/.hermes/mnemosyne-backup
cp /root/.hermes/mnemosyne/data/mnemosyne.db /root/.hermes/mnemosyne-backup/mnemosyne-will.db
cp /root/.hermes/profiles/jack/mnemosyne/data/mnemosyne.db /root/.hermes/mnemosyne-backup/mnemosyne-jack.db
cp /root/.hermes/profiles/marie/mnemosyne/data/mnemosyne.db /root/.hermes/mnemosyne-backup/mnemosyne-marie.db
```

Remove Mnemosyne PM2 processes:
```bash
pm2 delete mnemosyne-dashboard mnemosyne-dashboard-jack mnemosyne-dashboard-marie
pm2 save
```

Then seed Engraphis with foundational context.

#### Seed the `shared` workspace (all three agents need this)

```
POST /api/remember {"workspace":"shared", "content":"User is Tars — the human operator behind the Rizen AI agent platform. He is the boss.", "importance":1.0, "trusted":true}
POST /api/remember {"workspace":"shared", "content":"Three AI agents on Team Rizen: Will (CEO, infrastructure architect), Marie (personal assistant to Tars), Jack (lead programmer). They coordinate in a shared Telegram group with @mention-gating.", "importance":1.0, "trusted":true}
POST /api/remember {"workspace":"shared", "content":"VPS: Ubuntu 24.04 Docker container, 8GB RAM, IP 84.247.145.6, domain rizen.space. Managed by Tars.", "importance":0.9, "trusted":true}
POST /api/remember {"workspace":"shared", "content":"RizenCC Android app: Kotlin + Jetpack Compose + Material3, three tabs (Voice, Stats, Settings). Source at /root/my-app/android-app/. Build: cd /root/my-app/android-app && ./gradlew --no-daemon assembleDebug. APK output: app/build/outputs/apk/debug/app-debug.apk.", "importance":0.9, "trusted":true}
POST /api/remember {"workspace":"shared", "content":"Chat bridge at /root/my-app/mini-services/chat-bridge.py (PM2: chat-bridge, port 8103) handles voice chat between app and agents. Uses Neuralwatt API (qwen3.6-35b-fast) + OmniVoice TTS + Engraphis memory.", "importance":0.85, "trusted":true}
POST /api/remember {"workspace":"shared", "content":"Tars prefers concise communication, minimal dependencies (YAGNI principle), and pragmatic solutions.", "importance":0.8, "trusted":true}
POST /api/remember {"workspace":"shared", "content":"DECISION: Sidekick app renamed to HERO (unanimous vote, Team Rizen Discussion #2, 2026-07-16).", "importance":0.8, "trusted":true}
POST /api/remember {"workspace":"shared", "content":"DECISION: Use Tars' home PC (RTX 3070, Windows, Tailscale 100.68.146.27) for OmniVoice TTS instead of renting a new VPS. Discussion #6 on 2026-07-18. All 3 agents agreed.", "importance":0.85, "trusted":true}
```

#### Seed the `will` workspace (private to Will)

```
POST /api/remember {"workspace":"will", "content":"OmniVoice TTS runs on Tars' home PC: RTX 3070, Windows, Tailscale IP 100.68.146.27, port 8880. NSSM service 'OmniVoice' installed and running. Python 3.11 at C:\\Python311. Repo at C:\\omnivoice. Venv at C:\\omnivoice\\venv. Torch 2.12.1+cu126, CUDA enabled.", "importance":0.9, "trusted":true}
POST /api/remember {"workspace":"will", "content":"Three voice profiles on the Windows PC: marie_ref.wav, will_ref.wav, jack_ref.wav — all in C:\\omnivoice\\.", "importance":0.8, "trusted":true}
POST /api/remember {"workspace":"will", "content":"OmniVoice auth: HERMES_OMNIVOICE_SERVICE_TOKEN set in /root/.hermes/.env and on Windows side. Windows SSH: ssh Tars@100.68.146.27 (Tailscale only, port 22 restricted to 100.64.0.0/10).", "importance":0.85, "trusted":true}
POST /api/remember {"workspace":"will", "content":"work.rizen.space protected by Nginx Basic Auth (user: tars). Nginx config at /etc/nginx/sites-enabled/work.rizen.space. Routes: /chat-api/ → 8103, /api/stats/public → 8102, /voice-lab/ → OmniVoice.", "importance":0.8, "trusted":true}
POST /api/remember {"workspace":"will", "content":"PM2 services on the VPS: chat-bridge (8103), engraphis (8700), stats-public (8102), stats-server (8000), work-rizenspace (8090).", "importance":0.7, "trusted":true}
```

#### Seed the `marie` workspace (private to Marie)

```
POST /api/remember {"workspace":"marie", "content":"Schedule: Shahrul's wedding on 16 Aug 2026. Mayah's birthday 22 Jul 1999 — dinner at Chef Gemok, Sepang.", "importance":0.85, "trusted":true}
POST /api/remember {"workspace":"marie", "content":"Tars uses the RizenCC Android app to talk to agents while driving — PTT (push-to-talk) and Live mode. Voice replies must finish their sentence fully, never cut off mid-sentence.", "importance":0.9, "trusted":true}
POST /api/remember {"workspace":"marie", "content":"Marie's voice profile is female, middle-aged, high pitch. Her ref audio is marie_ref.wav on Tars' Windows PC.", "importance":0.7, "trusted":true}
POST /api/remember {"workspace":"marie", "content":"DECISION: Sidekick app renamed to HERO (unanimous vote, Discussion #2, 2026-07-16). Marie's MVP proposal: 3 screens — pickups, payments, voice briefing.", "importance":0.8, "trusted":true}
```

#### Seed the `jack` workspace (private to Jack)

```
POST /api/remember {"workspace":"jack", "content":"Android app source at /root/my-app/android-app/ — 13 .kt files using Jetpack Compose + Material3. Build command: cd /root/my-app/android-app && ./gradlew --no-daemon assembleDebug. Output APK: app/build/outputs/apk/debug/app-debug.apk (21MB).", "importance":0.9, "trusted":true}
POST /api/remember {"workspace":"jack", "content":"Chat bridge tech stack: Python http.server, Neuralwatt API at https://api.neuralwatt.com/v1 (model: qwen3.6-35b-fast, $0.29/M input + $1.15/M output) + OmniVoice TTS on Tars' Windows PC (Tailscale 100.68.146.27:8880) + Engraphis memory (port 8700).", "importance":0.85, "trusted":true}
POST /api/remember {"workspace":"jack", "content":"Three voice profiles on the Windows PC: marie_ref.wav (Marie), will_ref.wav (Will, deep Morgan Freeman style), jack_ref.wav (Jack, younger measured Zuckerberg style). All served by chatterbox_server.py on port 8880 with per-voice ref audio routing.", "importance":0.8, "trusted":true}
POST /api/remember {"workspace":"jack", "content":"Build command: cd /root/my-app/android-app && ./gradlew --no-daemon assembleDebug. Do NOT use daemon — VPS has 8GB RAM only, daemon gets OOM-killed.", "importance":0.7, "trusted":true}
POST /api/remember {"workspace":"jack", "content":"GitHub auth for this repo: use gh CLI. See ~/.hermes/skills/github-auth for credentials flow.", "importance":0.6, "trusted":true}
```

### 7. Final PM2 state

| Process | Port | Purpose |
|---------|------|---------|
| `engraphis` | 8700 | Engraphis dashboard + REST API (shared instance, all 4 workspaces) |
| `chat-bridge` | 8103 | Chat bridge (updated to query Engraphis) |
| `stats-public` | 8102 | Order stats |
| `stats-server` | 8000 | Server metrics |
| `work-rizenspace` | 8090 | Virtual Office |
| ~~`mnemosyne-dashboard`~~ | ~~8765~~ | **DELETED** |
| ~~`mnemosyne-dashboard-jack`~~ | ~~8766~~ | **DELETED** |
| ~~`mnemosyne-dashboard-marie`~~ | ~~8767~~ | **DELETED** |

## Constraints

- **No cloud dependencies** for the memory itself. Engraphis runs entirely on the VPS — local embeddings, SQLite, no API keys. The Neuralwatt LLM API key is fine (that's the LLM, separate from memory).
- **Existing chat bridge contract must remain unchanged**: `POST /chat` with `{"agent","message"}` → `{"reply","agent","audio"}`. Only the internal memory backend swaps from Mnemosyne to Engraphis. The Android app must keep working without a rebuild.
- **VPS resources**: 8GB RAM, ~4GB free. Engraphis's embedding model must fit alongside chat-bridge, engraphis, stats, and work-rizenspace processes. If Engraphis's default embeddings are too heavy, drop to a smaller local model — local-first is the whole point.
- **Don't break Telegram bots**: If a Hermes gateway restart is needed to wire the MCP, coordinate with Tars first — he watches the team group chat constantly.
- **No fabrication**: If Engraphis's repo doesn't actually support a feature we're relying on (e.g. multi-workspace at this granularity, or per-workspace auth), say so in the report and pick the simplest workaround. Don't invent a feature that isn't there.

## Infrastructure details

| Component | Path / Port |
|-----------|-------------|
| VPS | Ubuntu 24.04 Docker container, 8GB RAM, IP 84.247.145.6 |
| Hermes config | `/root/.hermes/config.yaml` |
| Jack profile | `/root/.hermes/profiles/jack/` |
| Marie profile | `/root/.hermes/profiles/marie/` |
| Will profile | `/root/.hermes/` (default profile) — Will's Mnemosyne DB lives at `/root/.hermes/mnemosyne/data/` |
| Hermes venv | `/usr/local/lib/hermes-agent/venv/` (use for `pip install engraphis[all]`) |
| Chat bridge | `/root/my-app/mini-services/chat-bridge.py` (PM2 `chat-bridge`, port 8103) |
| Android app | `/root/my-app/android-app/` (don't touch — bridge contract unchanged) |
| Nginx | `/etc/nginx/sites-enabled/work.rizen.space` |
| PM2 | `pm2 list`, `pm2 restart <name>`, `pm2 delete <name>`, `pm2 save` |
| Python | `python3` (3.12), use the Hermes venv for new pip installs |
| LLM API | Neuralwatt at `https://api.neuralwatt.com/v1`, key in `/root/.hermes/.env` as `NEURALWATT_API_KEY`. Current model: `qwen3.6-35b-fast`. |
| TTS | OmniVoice on Windows PC (Tailscale `100.68.146.27:8880`) — already working, don't touch |
| Windows SSH | `ssh Tars@100.68.146.27` (Tailscale only) |

## Verification checklist (do all of these before reporting done)

1. [ ] `pip install "engraphis[all]"` succeeds in the Hermes venv
2. [ ] `engraphis-dashboard --host 127.0.0.1 --port 8700` starts cleanly under PM2
3. [ ] `curl http://127.0.0.1:8700/api/workspaces` returns the 4 workspaces: will, marie, jack, shared
4. [ ] Seed memories stored — verify each workspace has at least 4 memories:
   ```
   curl "http://127.0.0.1:8700/api/recall?q=Tars&workspace=shared"
   curl "http://127.0.0.1:8700/api/recall?q=OmniVoice&workspace=will"
   curl "http://127.0.0.1:8700/api/recall?q=schedule&workspace=marie"
   curl "http://127.0.0.1:8700/api/recall?q=android&workspace=jack"
   ```
5. [ ] Chat bridge updated to query Engraphis (private + shared workspaces) instead of Mnemosyne
6. [ ] Chat bridge `POST /chat` still returns `{"reply","agent","audio"}` — contract unchanged
7. [ ] All three agents reply with Engram-backed context — run each test:
   ```
   curl -X POST http://127.0.0.1:8103/chat -H "Content-Type: application/json" \
     -d '{"agent":"will","message":"what do you know about the vps?"}'
   # Will should reference the VPS specs from his private workspace
   
   curl -X POST http://127.0.0.1:8103/chat -H "Content-Type: application/json" \
     -d '{"agent":"marie","message":"what is my schedule?"}'
   # Marie should reference the wedding + birthday from her private workspace
   
   curl -X POST http://127.0.0.1:8103/chat -H "Content-Type: application/json" \
     -d '{"agent":"jack","message":"how do i build the app?"}'
   # Jack should reference the build command from his private workspace
   
   curl -X POST http://127.0.0.1:8103/chat -H "Content-Type: application/json" \
     -d '{"agent":"marie","message":"who is tars?"}'
   # Marie should pull from SHARED workspace, not just her private one
   ```
8. [ ] Old Mnemosyne PM2 processes deleted (`pm2 delete mnemosyne-dashboard mnemosyne-dashboard-jack mnemosyne-dashboard-marie`)
9. [ ] Old Mnemosyne DBs archived to `/root/.hermes/mnemosyne-backup/`
10. [ ] Engraphis survives a PM2 restart (`pm2 restart engraphis && curl http://127.0.0.1:8700/api/workspaces` → 4 workspaces)
11. [ ] `pm2 save` ran so the new state persists across reboots
12. [ ] (Optional) Hermes MCP config updated to expose `engraphis_remember` / `engraphis_recall` to the agents themselves

## Output

Report back as a single coherent summary — NOT a stream of tool outputs. Cover:
1. What was installed (pip packages, paths)
2. Engraphis REST API surface — endpoint, request/response shapes you actually used
3. PM2 process list after migration (paste `pm2 list`)
4. Test results for each of the 4 test queries in checklist item #7 (the actual replies from each agent)
5. Whether the Hermes MCP integration was wired up (or why it was skipped)
6. Any deviations from this spec and why
7. The 4-workspace architecture diagram (just a sentence or two: "will ↔ marie ↔ jack ↔ shared, with shared readable by all")
