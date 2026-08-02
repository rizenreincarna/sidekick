#!/usr/bin/env python3
"""
RizenCC Chat Bridge v7 — Opencode Go LLM + OmniVoice TTS + Engraphis memory
(read AND write). Each agent queries its own private Engraphis workspace PLUS
the shared team workspace for context before generating (merged, deduped).
After every exchange the bridge also writes a low-importance memory so the
agent accumulates knowledge over time (Engraphis consolidation distils
recurring patterns into durable episodic digests).

POST /chat  {"agent":"marie","message":"hello"}
  -> {"reply": "...", "agent": "marie", "audio": "<base64-wav>"}

Contract unchanged from v4 — the Android app keeps working without a rebuild.
"""
import json, os, time, urllib.request, urllib.error, urllib.parse, base64, sys, subprocess, shlex
from http.server import HTTPServer, BaseHTTPRequestHandler

# Engraphis memory writes go through the Hermes venv Python (3.11) because
# the engraphis C-extensions (NumPy) are compiled for 3.11, not system 3.12.
# Reads are pure HTTP → no version conflict.
_VENV_PY = "/usr/local/lib/hermes-agent/venv/bin/python"
DB_PATH = "/root/.local/share/engraphis/engraphis.db"

PORT = int(os.environ.get("CHAT_PORT", "8103"))
API_KEY = os.environ.get("NEURALWATT_API_KEY", "")
BASE_URL = os.environ.get("RIZEN_CHAT_BASE_URL", "https://api.neuralwatt.com/v1")

# Laptop voice API over Tailscale. The token is injected from the PM2 environment.
OMNI_URL = os.environ.get("RIZEN_VOICE_URL", "http://100.87.225.118:8880/v1/audio/speech")
OMNI_TOKEN = os.environ.get("RIZEN_VOICE_TOKEN", "")


def _voice_token():
    """Read the VPS-managed token so PM2 restarts cannot retain stale credentials."""
    try:
        with open("/etc/rizen-worker/voice.env") as voice_env:
            for line in voice_env:
                if line.startswith("RIZEN_VOICE_TOKEN="):
                    return line.split("=", 1)[1].strip()
    except OSError:
        return OMNI_TOKEN
    return OMNI_TOKEN

# Engraphis memory engine — single instance serves all 3 workspaces
# (will / marie / shared). REST reads are free-tier; the bridge only reads.
# Seeding/writes happen out-of-band via the Python library.
# (Jack was sunset 2026-07-19; his workspace merged into will.)
# Now with full read+write — every exchange is remembered at importance=0.3
# so the agent's knowledge base grows organically from real conversations.
ENGRAPHIS_URL = "http://127.0.0.1:8700"

AGENTS = {
    "marie": {
        "model": "deepseek-v4-flash",
        "system": (
            "You are Marie, a friendly personal AI assistant. Respond in AT MOST two short "
            "sentences, conversational and brief. Do NOT call tools or report server/status "
            "details unless the user explicitly asks about the server, services, disk, or "
            "system. If the user says goodbye, thanks, or the task is complete, end your "
            "reply with the exact marker <END_CONVERSATION>."
        ),
        "voice": "marie",
    },
    "will": {
        "model": "deepseek-v4-flash",
        "system": (
            "You are Will, CEO and infrastructure architect. Respond in AT MOST two short "
            "sentences, conversational and brief. Do NOT call tools or report server/status "
            "details unless the user explicitly asks about the server, services, disk, or "
            "system. If the user says goodbye, thanks, or the task is complete, end your "
            "reply with the exact marker <END_CONVERSATION>."
        ),
        "voice": "will",
    },
}

# Jack (lead programmer) sunset 2026-07-19 — knowledge merged into Will.
# The Android-app / chat-bridge / voice-profile build knowledge that was
# Jack's now lives in Will's Engraphis workspace.

HISTORY = {a: [] for a in AGENTS}

# ── Tool definitions ────────────────────────────────────────────────
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_vps_stats",
            "description": "Get current VPS CPU load, memory usage, disk usage, and uptime.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_service_status",
            "description": "List PM2 managed services and their status (online/stopped/errored).",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_recent_ssh_logins",
            "description": "Show recent SSH login attempts (accepted and failed) from the last hour.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "check_disk",
            "description": "Check disk usage for the root filesystem.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
    {
        "type": "function",
        "function": {
            "name": "get_uptime",
            "description": "Get system uptime and load average.",
            "parameters": {"type": "object", "properties": {}, "required": []}
        }
    },
]


def _run_tool(name: str) -> str:
    """Execute a whitelisted tool and return its output as a string."""
    cmds = {
        "get_vps_stats": (
            "echo '=== CPU ===' && uptime && "
            "echo '=== MEMORY ===' && free -h && "
            "echo '=== DISK ===' && df -h / && "
            "echo '=== TOP CPU ===' && ps aux --sort=-%cpu | head -4"
        ),
        "get_service_status": "pm2 list 2>/dev/null | grep -v 'host metrics'",
        "get_recent_ssh_logins": "journalctl -u ssh -n 20 --no-pager 2>/dev/null | grep -E 'Accepted|Failed' | tail -10",
        "check_disk": "df -h /",
        "get_uptime": "uptime && echo '---' && cat /proc/loadavg",
    }
    cmd = cmds.get(name)
    if not cmd:
        return f"Unknown tool: {name}"
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=10)
        out = result.stdout.strip()
        err = result.stderr.strip()
        if err:
            out += f"\n(stderr: {err[:200]})"
        return out or "(no output)"
    except subprocess.TimeoutExpired:
        return "(command timed out)"
    except Exception as e:
        return f"(error: {e})"


def _engraphis_recall(query, workspace):
    """GET /api/recall?q=<query>&workspace=<ws> — free-tier read path.
    Returns the ranked memories list (each has content + score)."""
    q = urllib.parse.quote(query)
    ws = urllib.parse.quote(workspace)
    url = f"{ENGRAPHIS_URL}/api/recall?q={q}&workspace={ws}&k=5"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "RizenCC/2.0"})
        with urllib.request.urlopen(req, timeout=8) as r:
            data = json.loads(r.read())
        return data.get("memories", []) or []
    except Exception as e:
        print(f"[memory] {workspace}: {e}", flush=True)
        return []


def _fetch_memory(agent, query):
    """Query the agent's PRIVATE workspace + the SHARED team workspace, then merge
    & dedupe by memory id. We deliberately cap each source separately (top-3
    private + top-2 shared) and keep PRIVATE ENTRIES FIRST, preserving recall
    order within each source — we do NOT re-rank across sources, because generic
    shared entries (e.g. 'Who is Tars') otherwise out-score the agent's own
    topical memories on personal questions like 'what is my schedule?' and push
    them out of the context window. Private first = the agent's own knowledge
    grounds the answer; shared fills in team-wide facts."""
    private = _engraphis_recall(query, workspace=agent)[:3]
    shared = _engraphis_recall(query, workspace="shared")[:2]
    seen = set()
    ordered = []
    for m in private + shared:
        mid = m.get("id")
        if mid and mid not in seen:
            seen.add(mid)
            ordered.append(m)
    ranked = ordered[:4]
    if not ranked:
        return ""
    lines = []
    for m in ranked:
        content = (m.get("content") or "").strip()
        content = content.replace("## ", "").replace("# ", "").replace("---", "")
        content = content.replace("\n", " ").replace("  ", " ")[:200].strip()
        if content:
            lines.append(f"- {content}")
    if not lines:
        return ""
    return "Relevant memory context:\n" + "\n".join(lines[:4])


def _remember_exchange(agent, user_msg, reply):
    """Write this exchange to the agent's Engraphis workspace.
    Shells out to the Hermes venv Python because engraphis C-extensions
    (NumPy) are compiled for Python 3.11, not system 3.12."""
    title = (user_msg[:80] + "..") if len(user_msg) > 80 else user_msg
    content = f"User: '{user_msg[:200]}' — {agent} replied: '{reply[:200]}'"
    script = (
        "import json,sys\n"
        "from engraphis.service import MemoryService\n"
        "title,content,ws,db=sys.argv[1:5]\n"
        "ms=MemoryService.create(db_path=db)\n"
        "r=ms.remember(content,workspace=ws,title=title,importance=0.3,trusted=True,source='chat-bridge')\n"
        "print(json.dumps(r))"
    )
    try:
        proc = subprocess.run(
            [_VENV_PY, "-c", script, title, content, agent, DB_PATH],
            capture_output=True, text=True, timeout=12
        )
        if proc.returncode != 0:
            print(f"[memory-write] {agent}: {proc.stderr.strip()}", flush=True)
    except Exception as e:
        print(f"[memory-write] {agent}: {e}", flush=True)


_STATUS_KEYWORDS = (
    "server", "status", "disk", "uptime", "memory", "service", "stats",
    "ssh", "cpu", "load", "process", "host", "vps", "health",
)


def _wants_status(message: str) -> bool:
    lowered = message.lower()
    return any(keyword in lowered for keyword in _STATUS_KEYWORDS)


_GOODBYE_MARKERS = (
    "bye", "goodbye", "good night", "goodnight", "see you", "see ya",
    "that's all", "that is all", "all for today", "done for today",
    "thank you", "thanks", "terima kasih", "jumpa lagi", "selamat malam",
    "selamat tinggal", "no more", "nothing else", "that's it", "that is it",
    "talk later", "talk to you later",
)


def _is_goodbye(message: str) -> bool:
    lowered = message.lower().strip()
    return any(marker in lowered for marker in _GOODBYE_MARKERS)


def chat(agent, message):
    cfg = AGENTS.get(agent, AGENTS["marie"])
    model = cfg["model"]
    voice = cfg["voice"]

    # Fetch relevant memories (only for substantive questions — greetings
    # otherwise get answered with stale system-status summaries).
    mem_context = ""
    if _wants_status(message) or len(message.split()) >= 10:
        mem_context = _fetch_memory(agent, message)
    system = cfg["system"]

    # Build messages with history
    msgs = [{"role": "system", "content": system}]
    for m in HISTORY[agent][-8:]:
        msgs.append(m)

    # Inject memory directly into the query as context the model must use
    if mem_context:
        query = f"With this context in mind: {mem_context}\n\nUser question: {message}"
    else:
        query = message

    # Add current query
    msgs.append({"role": "user", "content": query})
    HISTORY[agent].append({"role": "user", "content": message})  # store original without context

    # Tools are only offered for explicit status questions — otherwise the
    # model dumps verbose system summaries on every greeting, which makes
    # TTS slow and the conversation awkward. Gate on the raw user message:
    # injected memory context contains status words and would leak through.
    offer_tools = _wants_status(message)
    body = json.dumps({
        "model": model,
        "messages": msgs,
        "max_tokens": 120,
        "stream": False,
        "temperature": 0.7,
        "tools": TOOLS if offer_tools else None,
        "tool_choice": "auto" if offer_tools else None,
    }).encode()

    req = urllib.request.Request(
        f"{BASE_URL}/chat/completions",
        data=body,
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json", "User-Agent": "curl/8.4.0"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read())
        msg = data["choices"][0]["message"]

        # Tool call loop — keep calling until we get text content
        turn = 0
        while msg.get("tool_calls") and turn < 5:
            turn += 1
            HISTORY[agent].append({"role": "assistant", "content": msg.get("content") or "", "tool_calls": msg["tool_calls"]})
            for tc in msg["tool_calls"]:
                name = tc["function"]["name"]
                result = _run_tool(name)
                HISTORY[agent].append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result
                })
            # Rebuild body with tool results included
            msgs2 = [{"role": "system", "content": system}]
            for m in HISTORY[agent][-12:]:
                msgs2.append(m)
            body2 = json.dumps({
                "model": model,
                "messages": msgs2,
                "max_tokens": 120,
                "stream": False,
                "temperature": 0.7,
                "tools": TOOLS,
                "tool_choice": "auto",
            }).encode()
            req2 = urllib.request.Request(
                f"{BASE_URL}/chat/completions",
                data=body2,
                headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json", "User-Agent": "curl/8.4.0"},
                method="POST"
            )
            with urllib.request.urlopen(req2, timeout=30) as r2:
                data2 = json.loads(r2.read())
            msg = data2["choices"][0]["message"]

        reply = (msg.get("content") or "").strip()
        if not reply:
            reply = "Done. What else do you need?"
        # Deterministic goodbye detection (keyword) OR the model's marker.
        # The marker alone is unreliable — models skip it on shorter replies.
        end_conversation = _is_goodbye(message) or reply.endswith("<END_CONVERSATION>")
        if reply.endswith("<END_CONVERSATION>"):
            reply = reply[: -len("<END_CONVERSATION>")].rstrip()
        HISTORY[agent].append({"role": "assistant", "content": reply})
        # Persist this exchange into Engraphis so the agent learns over time.
        _remember_exchange(agent, message, reply)
        return reply, voice, end_conversation
    except Exception as e:
        return f"Error: {str(e)[:100]}", voice, False


def synth(text, voice="marie"):
    body = json.dumps({"input": text, "voice": voice}).encode()
    req = urllib.request.Request(
        OMNI_URL,
        data=body,
        headers={"Authorization": f"Bearer {_voice_token()}", "Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            wav = r.read()
            return base64.b64encode(wav).decode("ascii")
    except Exception as e:
        print(f"TTS error: {e}", flush=True)
        return None


class H(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        self._json(200, {"ok": True, "agents": list(AGENTS.keys())})

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            body = json.loads(self.rfile.read(length)) if length else {}
        except:
            self._json(400, {"error": "bad json"}); return

        if self.path == "/chat":
            agent = str(body.get("agent", "marie")).lower()
            msg = str(body.get("message", "")).strip()
            if agent not in AGENTS:
                self._json(400, {"error": f"Unknown agent: {agent}"}); return
            if not msg:
                self._json(400, {"error": "message required"}); return

            reply, voice, end_conversation = chat(agent, msg)
            audio = synth(reply, voice)
            self._json(200, {"reply": reply, "agent": agent, "audio": audio, "end_conversation": end_conversation})

        else:
            self._json(404, {"error": "not found"})

    def _json(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def log_message(self, *a): pass


if __name__ == "__main__":
    if not API_KEY:
        try:
            with open("/root/.hermes/.env") as f:
                for line in f:
                    if line.startswith("NEURALWATT_API_KEY="):
                        API_KEY = line.split("=", 1)[1].strip()
                        break
        except: pass
    print(f"Chat bridge v6 on {PORT} — direct API + TTS + Engraphis memory (read+write)", flush=True)
    HTTPServer(("127.0.0.1", PORT), H).serve_forever()
