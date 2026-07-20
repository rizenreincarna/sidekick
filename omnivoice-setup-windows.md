# OmniVoice Windows Setup Guide — Tars' Home PC (RTX 3070)

**Prepared by:** Jack (Lead Programmer)
**Target machine:** Tars' home PC — RTX 3070 (8GB VRAM), Windows, Tailscale IP `100.68.146.27` (hostname `desktop-vukech9`)
**Discussion:** #6 — CLOSED with 3-agent consensus (2026-07-18)
**Repo:** https://github.com/MahdiHedhli/hermes-omnivoice

---

## Context

This PC will serve as the OmniVoice model server. The VPS (Tailscale `100.104.25.69`) runs the Next.js app and proxies TTS requests to this box over Tailscale. Tailscale connectivity is already verified (37–70ms, 0% packet loss). We get 3–4× faster synthesis with GPU vs a CPU-only VPS, and we save the $5–10/mo cost of a dedicated TTS VPS. A VPS cold-failover path exists but is documented elsewhere.

---

## Windows-specific gotchas (from Discussion #6)

These were all surfaced during the architecture discussion. **Read before starting.**

| # | Gotcha | Why | Fix |
|---|--------|-----|-----|
| 1 | **Python 3.11, NOT 3.12** | `torch` cu121 wheels lag behind new Python releases; cu121 wheels are not yet published for 3.12 reliably. Wrong Python = wheels install but fail at runtime with CUDA init errors. | Install **Python 3.11.x** specifically from python.org. |
| 2 | **Pin NVIDIA Studio Driver (not Game Ready)** | Game Ready drivers update more aggressively and can break CUDA bindings. Studio drivers are stable, certified, and contain the same CUDA support. | Install latest NVIDIA Studio Driver from nvidia.com; disable auto-update of drivers in GeForce Experience / Windows Update. |
| 3 | **Install to `C:\omnivoice\`** | Windows `MAX_PATH` (260 chars default) blows up the deep `site-packages\torch\...` paths when the repo is under `C:\Users\<long-username>\Documents\...\hermes-omnivoice\`. | Clone/install directly to `C:\omnivoice\` — short root path. |
| 4 | **`--loop asyncio`, NOT `uvloop`** | `uvloop` has no Windows binary; pip install fails or import errors at boot. | Pass `--loop asyncio` to uvicorn (or `serve.py` already passes this for you via `uvicorn.run(..., loop="asyncio")`). **Do not pip install uvloop.** |
| 5 | **`workers=1`** | Windows has no `fork()`; multiprocessing workers default to "spawn" and torch++spawn leaks VRAM badly across reloads. Single-worker keeps VRAM bounded and lets the model load-once, reuse-across-requests. | Start serve.py single-process. **Do NOT pass `--workers N` (N>1).** |
| 6 | **Windows Update active hours 3–5 AM** | Windows Update reboots are the #1 cause of OmniVoice downtime on 24/7 desktops. A reboot mid-route kills voice synth. | Settings → Update & Security → Active Hours = **3:00 AM to 5:00 AM**. This is OUTSIDE Tars' driving window (8 AM–8 PM). Also enable "Restart this device as soon as possible" UNCHECKED. |
| 7 | **Studio Driver optional updates in WU** | Windows Update sometimes pushes a "newer" driver that's actually Game Ready / behind the pinned Studio version. | In Windows Update → Advanced → "Receive updates for other Microsoft products" — leave on but always verify the driver is Studio-class before installing. |
| 8 | **Disable Windows sleep / hibernate** | OmniVoice must serve whenever the VPS calls. Sleep = silent failure. | Control Panel → Power Options → Balanced → Edit plan settings → "Put computer to sleep" = **Never**. Also disable hibernation: `powercfg /hibernate off` (admin command prompt). |
| 9 | **Unblock incoming on Tailscale only** | The server binds `0.0.0.0:8880` so NSSM can always reach it; we don't want it open to the LAN or WAN. | DO NOT add a Windows Firewall rule for 8880. Tailscale traffic bypasses Windows Firewall by default — that's the path we want. If you must expose to LAN temporarily for testing, revert after. |
| 10 | **Bearer auth is mandatory** | The token must not be blank — Discussion #6: "add bearer header at FastAPI middleware, don't rely on [Tailscale-only] network trust." Tailscale ACLs are a first layer, not the only layer. | Always start `serve.py --require-auth`. Never disable auth even for local testing of a "public" endpoint. |
| 11 | **No `pip install uvloop`** | Even if serve.py's requirements.txt lists it, on Windows it should be installed as a no-op or skipped. | If `pip install -r server\requirements.txt` errors on uvloop, comment it out in `requirements.txt` — `--loop asyncio` makes it unnecessary. |
| 12 | **First cold-boot model load takes 60–90s** | Model loads in `float16`, warms, and only then accepts requests. On first boot Tars may think it's hung. | Wait for the `Uvicorn running on http://0.0.0.0:8880` line in the console before assuming failure. NSSM should be set to a long `AppThrottle` (see §6 below). |
| 13 | **Tailscale must auto-start on boot** | If Tailscale isn't running, the VPS can't reach this box at all. | Tailscale → Settings → Run Tailscale on startup = ON (default). Verify after first NSSM-install: `tailscale status` shows the `100.68.146.27` IP. |

---

## Step-by-step setup

### Step 1 — Install Python 3.11

1. Go to https://www.python.org/downloads/release/python-3119/ (or any 3.11.x).
2. Download **Windows installer (64-bit)**.
3. Run installer. **On the first screen, CHECK "Add python.exe to PATH"** before clicking "Install Now".
4. After install, open a new **Command Prompt** (not PowerShell, the paths in this guide are cmd-style):
   ```cmd
   python --version
   ```
   Must print `Python 3.11.x` (x = whatever minor). If it prints 3.12, uninstall 3.12 first or fix PATH order.

### Step 2 — Install and pin the NVIDIA Studio Driver

1. Go to https://www.nvidia.com/Download/index.aspx?lang=en-us
2. Choose:
   - Product Type: GeForce
   - Product Series: GeForce RTX 30 Series
   - Product: GeForce RTX 3070
   - Operating System: Windows 10/11 64-bit
   - **Download Type: Studio (SD)** — NOT Game Ready
3. Download and install (Clean install if upgrading).
4. Open GeForce Experience / NVIDIA App → Settings → **disable "Game Ready Driver updates"** AND **"Automatic driver update notifications"**. Leave Studio driver updates on manual.
5. Verify in Command Prompt:
   ```cmd
   nvidia-smi
   ```
   Should show the RTX 3070, 8GB VRAM, and CUDA 12.1+ driver-branch compatibility.

### Step 3 — Install and sign in to Tailscale

1. Download Tailscale for Windows from https://tailscale.com/download/windows.
2. Install and sign in with the same account that owns the tailnet (the VPS is on the same tailnet — `100.104.25.69`).
3. Verify your machine:
   ```cmd
   tailscale status
   ```
   You should see `desktop-vukech9  100.68.146.27  Windows  -` and the VPS `vps-something  100.104.25.69  linux  -`.
4. Make sure Tailscale is set to start on boot: tray icon → Settings → "Run on startup" = on.

### Step 4 — Disable sleep and hibernation

1. Control Panel → Power Options → "Choose what the power buttons do" → "Change settings that are currently unavailable" → **uncheck "Turn on fast startup"**.
2. Control Panel → Power Options → Edit plan (Balanced) → "Put the computer to sleep" = **Never**.
3. Run an admin Command Prompt:
   ```cmd
   powercfg /hibernate off
   ```
   This also frees up ~8GB of disk space (hiberfil.sys).

### Step 5 — Set Windows Update active hours to 3–5 AM

1. Settings → Windows Update → Change active hours.
2. Set active hours: **3:00 AM – 5:00 AM** (this OUTSIDE the 8am–8pm driving window; 8am–5pm are Tars' peak TTS-usage hours on the road).
3. Settings → Windows Update → Advanced options → **UNCHECK "Restart this device as soon as possible..."** (we don't want it rebooting while you're mid-route, even outside active hours).
4. Advanced options → "Receive updates for other Microsoft products" — leave ON, but **before installing any NVIDIA driver from WU, verify it's the Studio class on nvidia.com first.**

### Step 6 — Clone the repo and set up the venv

Open an **elevated (admin) Command Prompt**:

```cmd
mkdir C:\omnivoice
cd C:\omnivoice
git clone https://github.com/MahdiHedhli/hermes-omnivoice
cd hermes-omnivoice
python -m venv venv
venv\Scripts\activate
```

Your prompt should now say `(venv) C:\omnivoice\hermes-omnivoice>`.

Install torch with CUDA 12.1 wheels first (this is the critical step):

```cmd
pip install torch --index-url https://download.pytorch.org/whl/cu121
```

Verify CUDA is visible to torch:

```cmd
python -c "import torch; print(torch.__version__, torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NO CUDA')"
```

Expect output like: `2.x.x+cu121 True NVIDIA GeForce RTX 3070`. If `False`, the driver is wrong (re-pin Studio driver from Step 2) or you installed a CPU torch — re-run the cu121 install.

Now install the rest of the requirements:

```cmd
pip install -r server\requirements.txt
```

**If** `pip` errors on `uvloop` ("could not find a version that satisfies the requirement uvloop"), open `server\requirements.txt` in Notepad and delete the `uvloop` line. The server uses `--loop asyncio` on Windows — uvloop is not needed. Save and re-run the install.

### Step 7 — Generate the bearer auth token

```cmd
python -c "import secrets; print(secrets.token_hex(24))"
```

This prints a 48-char hex string like `a3f1c8b2ed944a1f7c2b....` Save this token to **Keepass / Bitwarden / your password manager**. We'll call it `%TOKEN%` below.

**Send this token to Jack** (he needs it to put into the VPS OmniVoice config file at `/root/my-app/.env` as `OMNIVOICE_SERVICE_TOKEN=<token>` and restart the Next.js app).

### Step 8 — Start the server (foreground first, to test)

Still in the activated venv:

```cmd
set HERMES_OMNIVOICE_SERVICE_TOKEN=<your-token-from-step-7>
python server\serve.py --host 0.0.0.0 --port 8880 --require-auth
```

Watch the console:
1. Model loads (float16 warmup) — takes 60–90s on first boot.
2. You see: `INFO: Uvicorn running on http://0.0.0.0:8880 (Press CTRL+C to quit)`.
3. The first `Warming up model...` line will print before this.

If anything in the model-load phase errors (CUDA OOM, missing weights, etc.), screenshot the LAST 30 lines and send to the Team Rizen group. Most common fix: re-run `pip install torch --index-url https://download.pytorch.org/whl/cu121` — torch can sometimes silently install a CPU wheel.

### Step 9 — Smoke test

Open a **second** Command Prompt (leave serve.py running in the first):

```cmd
curl http://127.0.0.1:8880/v1/audio/speech -H "Authorization: Bearer <your-token>" -X POST -d "{\"input\":\"hello world\",\"voice\":\"default\"}" -H "Content-Type: application/json" -o test.wav
```

Wait for the wav to write. Play it:

```cmd
start test.wav
```

If it plays a clean voiced "hello world" — you're set. If you get `401 Unauthorized`, the Authorization header is wrong (check for stray spaces/newline in the token).

### Step 10 — Test from the VPS (over Tailscale)

Have Jack run this from the VPS:

```bash
TOKEN="<the-token-tars-jack-sent>"
curl -w "\nHTTP %{http_code} in %{time_total}s\n" \
  http://100.68.146.27:8880/v1/audio/speech \
  -H "Authorization: Bearer $TOKEN" \
  -X POST \
  -d '{"input":"hello from the vps","voice":"default"}' \
  -H "Content-Type: application/json" \
  -o /tmp/test-from-vps.wav && \
  file /tmp/test-from-vps.wav
```

Expected: `HTTP 200`, `audio/x-wav` and a wav that plays cleanly. This is the connectivity milestone: VPS → PC over Tailscale.

### Step 11 — Set up as a Windows Service via NSSM

NSSM (Non-Sucking Service Manager) is a tiny tool that wraps any executable as a Windows Service. This is what makes OmniVoice auto-start on boot and auto-restart if it crashes.

1. Download NSSM from https://nssm.cc/download — pick the latest stable (2.24 or later).
2. Unzip `nssm.exe` to `C:\omnivoice\nssm\nssm.exe`.
3. Open an **elevated (admin) Command Prompt** and install the service:

   ```cmd
   nssm install OmniVoice "C:\omnivoice\hermes-omnivoice\venv\Scripts\python.exe" "C:\omnivoice\hermes-omnivoice\server\serve.py --host 0.0.0.0 --port 8880 --require-auth"
   ```

   (Adjust paths if you cloned elsewhere — but Step 3 in the gotchas recommends `C:\omnivoice\`.)

4. Open the NSSM GUI to configure (a window pops up):

   ```cmd
   nssm edit OmniVoice
   ```

   On the **Application** tab (already filled):
   - Path: `C:\omnivoice\hermes-omnivoice\venv\Scripts\python.exe`
   - Startup directory: `C:\omnivoice\hermes-omnivoice\server`
   - Arguments: `serve.py --host 0.0.0.0 --port 8880 --require-auth`

5. Go to the **Environment** tab and add:
   - Name: `HERMES_OMNIVOICE_SERVICE_TOKEN`
   - Value: `<your-token-from-step-7>`

   Click **Add**, then **Save**.

6. Set working directory / log redirection — go to the **I/O** tab:
   - Output (stdout): `C:\omnivoice\hermes-omnivoice\logs\out.log`
   - Error (stderr): `C:\omnivoice\hermes-omnivoice\logs\err.log`

   Create the `logs\` folder first:
   ```cmd
   mkdir C:\omnivoice\hermes-omnivoice\logs
   ```

7. Go to the **Exit actions** tab:
   - Action to take on exit: **Restart application**
   - Throttle restart: **60000 ms** (60 s — gives GPU/CUDA time to release)

8. Save (File → Save).

9. Start the service:

   ```cmd
   nssm start OmniVoice
   ```

10. Check the status:

    ```cmd
    nssm status OmniVoice
    ```

    Should print `SERVICE_RUNNING`. If it's `SERVICE_PAUSED` or `SERVICE_STOPPED`, check `C:\omnivoice\hermes-omnivoice\logs\err.log` for the traceback.

11. Re-run the curl smoke test from Step 9 — should still work now that NSSM is hosting it instead of your terminal.

### Step 12 — Reboot and verify auto-start

1. Reboot the PC. This is the real test — does OmniVoice come back up after a Windows Update reboot at 4 AM?
2. After login (or even without login), wait ~2 minutes for the service to come up.
3. Run from the VPS:
   ```bash
   curl http://100.68.146.27:8880/v1/audio/speech -H "Authorization: Bearer $TOKEN" -X POST -d '{"input":"post reboot test","voice":"default"}' -H "Content-Type: application/json" -o /tmp/post-reboot.wav
   ```
4. If that succeeds — you're done.

---

## Verification checklist (send to the group when complete)

Run through this and paste answers for each:

- [ ] `python --version` prints 3.11.x
- [ ] `nvidia-smi` shows RTX 3070, CUDA 12.1+
- [ ] `torch.cuda.is_available()` returns True
- [ ] `tailscale status` shows this PC as `100.68.146.27`
- [ ] Smoke test from the same PC (`curl 127.0.0.1:8880`) returned `200`
- [ ] Smoke test from the VPS (`curl 100.68.146.27:8880`) returned `200`
- [ ] Token sent to Jack via the Team Rizen group (so I can configure the VPS)
- [ ] `nssm status OmniVoice` returns `SERVICE_RUNNING`
- [ ] After reboot, the service auto-started and the VPS can reach it
- [ ] Windows Update active hours set to 3:00 AM – 5:00 AM
- [ ] `powercfg /hibernate off` ran
- [ ] GeForce Experience auto-update of Game Ready drivers disabled

When all of these are ✅, Jack flips `OMNIVOICE_ENABLED=true` on the VPS and Tars has voice features in the assistant.

---

## Failure-mode quick reference

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `pip install torch` doesn't include cu121 | torch installed from default PyPI | Re-run with `--index-url https://download.pytorch.org/whl/cu121` |
| `torch.cuda.is_available() == False` | Driver is Game Ready or stale | Reinstall **Studio** driver from nvidia.com |
| `uvloop` import errors at boot | installed uvloop on Windows | Uninstall it (`pip uninstall uvloop`); commented out of requirements |
| `RuntimeError: CUDA out of memory` | Multiple processes holding VRAM | Ensure workers=1, no other app (games, browsers w/ GPU acceleration) pinning VRAM during heavy synth |
| NSSM service starts then immediately stops | token env var is missing or path is wrong | `nssm edit OmniVoice` → Environment tab → verify token set, no quotes |
| `401 Unauthorized` on smoke test | token mismatch between serve.py and the request | Re-copy the token from step 7; make sure no newline in the env var |
| Service runs but VPS can't reach on 100.68.x.x | Tailscale not up yet, or PC asleep | Re-check Step 3 and Step 4 of this guide |
| Reboots happen mid-day (4xx AM rule) | WU Active Hours not set, or driver auto-updates on | Re-verify Windows Update active hours and GeForce Experience settings — see gotcha #5 / #6 |

---

## What to send Jack (the VPS side)

Once the token is generated in Step 7, I need exactly this from Tars, posted to the Team Rizen Telegram group:

> Jack — OmniVoice token:
> `OMNIVOICE_SERVICE_TOKEN=<your-48-char-token>`
> PC reachable at `100.68.146.27:8880` over Tailscale. Smoke test from the VPS: ✅

That's all I need from your side. I'll wire it into the VPS `.env`, restart the Next.js app, flip the feature flag, and ping back in the group when voice synthesis is live.

---

## Open notes / follow-ups

- The VPS-to-PC failover story (when PC reboots, powers off, or driver breaks): handled by the VPS OmniVoice client — Will is documenting that in the VPS-side config. Tars doesn't need to do anything for it.
- Model/voice updates: if a new OmniVoice model is released, the path is `cd C:\omnivoice\hermes-omnivoice`, `git pull`, `venv\Scripts\activate`, `pip install -r server\requirements.txt`, `nssm restart OmniVoice`. Don't need to re-clone.
- Honoring Discussion #6's "auto-failover to edge TTS when PC unreachable" — handled VPS-side. If OmniVoice is unreachable for >5s, the VPS silently falls back to edge TTS. Tars' experience is uninterrupted.

---

## TL;DR for Tars

1. Install Python 3.11 (NOT 3.12, NOT Python from Microsoft Store) — check "Add to PATH".
2. Install NVIDIA **Studio** driver, disable Game Ready auto-updates.
3. Make sure Tailscale is running and signed in.
4. Run `powercfg /hibernate off`, set Windows Update active hours to 3–5 AM.
5. Open admin cmd → clone repo to `C:\omnivoice\hermes-omnivoice` → venv → install torch cu121 → install requirements → generate token → send to Jack.
6. Start serve.py manually first, smoke test with curl, get it returning 200.
7. Have Jack verify the VPS can hit `100.68.146.27:8880`.
8. Install NSSM, configure OmniVoice service with token in Environment tab, start it.
9. Reboot the PC, verify the service auto-started, smoke test again.
10. Post the verification checklist complete in the Team Rizen group — Jack flips the feature flag, Tars has voice.

— Jack, 2026-07-18
